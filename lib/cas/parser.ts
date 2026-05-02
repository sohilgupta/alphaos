import type { CASEquityHolding, CASMutualFund, ParsedCAS } from './types';

const PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;

function stripPII(text: string): string {
  return text.replace(PAN_RE, '[PAN_REDACTED]');
}

function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, '').trim());
  return isFinite(n) && n >= 0 ? n : null;
}

function extractNumbers(s: string): number[] {
  return (s.match(/[\d,]+\.?\d*/g) ?? [])
    .map(n => parseNum(n))
    .filter((n): n is number => n !== null);
}

// Standalone ISIN line: the entire trimmed line is exactly an ISIN (12 chars)
const STANDALONE_ISIN_RE = /^(IN[EF][A-Z0-9]{8}[0-9])$/;

// CDSL equity: ISIN followed by company name on the same line
// e.g. "INE216P01012 AAVAS FINANCIERS LIMITED"
const CDSL_INLINE_RE = /^(INE[A-Z0-9]{8}[0-9])\s+(.+)$/;

// CDSL balance header: "# EQUITY SHARES <qty>"
const EQUITY_SHARES_RE = /^#\s+EQUITY\s+SHARES\s+([\d,.]+\.?\d*)/i;

// Single decimal number (CDSL balance breakdown lines, e.g. "20.000", "0.000")
const DECIMAL_ONLY_RE = /^[\d,]+\.\d+\s*$/;

// Exactly two numbers on a line (CDSL price + value line)
// e.g. "1,078.90 21,578.00"
const TWO_NUMS_RE = /^([\d,]+\.?\d+)\s+([\d,]+\.?\d+)\s*$/;

// NSDL data line: SYMBOL.NSE NAME facevalue qty price value
// e.g. "BAJAJFINSV.NSE BAJAJ FINSERV LIMITED 1.00 650 1,631.80 10,60,670.00"
function parseNSDLDataLine(line: string): {
  ticker: string;
  name: string;
  quantity: number;
  marketPrice: number | null;
  value: number;
} | null {
  const symbolMatch = /^([A-Z0-9\-&]+\.(?:NSE|BSE))\s+/.exec(line);
  if (!symbolMatch) return null;

  const ticker = symbolMatch[1].replace('.NSE', '.NS').replace('.BSE', '.BO');
  const rest = line.slice(symbolMatch[0].length).trim();

  // Trailing 3-4 space-separated numeric groups = facevalue qty price value
  const trailingMatch = rest.match(/(?:\s+[\d,]+\.?\d*){3,4}\s*$/);
  if (!trailingMatch) return null;

  const nums = extractNumbers(trailingMatch[0]);
  if (nums.length < 3) return null;

  // name is everything before the trailing numeric groups
  const name = rest.slice(0, rest.length - trailingMatch[0].length).trim() || ticker.replace('.NS', '').replace('.BO', '');

  // From right: value, price, qty (facevalue is further left)
  const value = nums[nums.length - 1];
  const marketPrice = nums[nums.length - 2] ?? null;
  const quantity = nums[nums.length - 3] ?? 0;

  return { ticker, name, quantity, marketPrice, value };
}

function parseAll(lines: string[]): {
  equities: CASEquityHolding[];
  mutualFunds: CASMutualFund[];
} {
  const equities: CASEquityHolding[] = [];
  const mutualFunds: CASMutualFund[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // ── Standalone ISIN (NSDL equity or MF) ──────────────────────────────────
    const standaloneMatch = STANDALONE_ISIN_RE.exec(line);
    if (standaloneMatch) {
      const isin = standaloneMatch[1];

      // Skip to next non-empty line
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;

      if (isin.startsWith('INF')) {
        // ── Mutual Fund ───────────────────────────────────────────────────────
        // Collect description lines until we hit a digit-starting line (data)
        const descLines: string[] = [];
        let k = j;
        while (k < lines.length) {
          const l = lines[k].trim();
          if (!l) { k++; continue; }
          if (STANDALONE_ISIN_RE.test(l) || CDSL_INLINE_RE.test(l)) break;

          if (/^\d/.test(l)) {
            // Could be folio+data line or pure-data line
            // Check if line might have mixed scheme text + folio (folio is 10+ digits embedded)
            const allTextBeforeDigit = l.match(/^[^\d]*/)?.[0]?.trim();
            if (allTextBeforeDigit) {
              descLines.push(allTextBeforeDigit.replace(/^NOT\s+AVAILABLE\s+/i, '').trim());
            }
            break;
          }

          // Some lines start with "NOT AVAILABLE" (UCC placeholder) — strip it
          descLines.push(l.replace(/^NOT\s+AVAILABLE\s+/i, '').trim());
          k++;
        }

        let schemeName = descLines.filter(Boolean).join(' ').trim();
        if (!schemeName) schemeName = isin;

        // Collect numbers from up to 3 lines starting at k
        const allNums: number[] = [];
        let dataEnd = k;
        for (let m = k; m < Math.min(lines.length, k + 3) && allNums.length < 8; m++) {
          const dl = lines[m].trim();
          if (!dl) continue;
          if (STANDALONE_ISIN_RE.test(dl) || CDSL_INLINE_RE.test(dl)) break;
          allNums.push(...extractNumbers(dl));
          dataEnd = m + 1;
        }

        if (allNums.length >= 2) {
          // If first number looks like a folio (large integer ≥ 1e8), skip it
          const offset = allNums[0] >= 1e8 ? 1 : 0;
          const units = allNums[offset] ?? 0;
          // Columns: units, avgcost, totalcost, currentNAV, currentValue, pnl, return
          const nav = allNums.length > offset + 3 ? (allNums[offset + 3] ?? null) : null;
          const value = allNums.length > offset + 4
            ? (allNums[offset + 4] ?? 0)
            : (allNums[allNums.length - 1] ?? 0);

          if (units > 0) {
            mutualFunds.push({ isin, schemeName, units, nav, value });
          }
        }

        i = dataEnd;
        continue;
      } else {
        // ── NSDL Equity ───────────────────────────────────────────────────────
        if (j < lines.length) {
          const parsed = parseNSDLDataLine(lines[j].trim());
          if (parsed && parsed.quantity > 0) {
            equities.push({
              isin,
              name: parsed.name,
              quantity: parsed.quantity,
              marketPrice: parsed.marketPrice,
              value: parsed.value,
              ticker: parsed.ticker,
            });
            i = j + 1;
            continue;
          }
        }
        i++;
        continue;
      }
    }

    // ── CDSL Inline ISIN+Name line ────────────────────────────────────────────
    const cdslMatch = CDSL_INLINE_RE.exec(line);
    if (cdslMatch) {
      const isin = cdslMatch[1];
      const name = cdslMatch[2].trim();

      let j = i + 1;
      let quantity = 0;
      let marketPrice: number | null = null;
      let value = 0;
      let found = false;

      // Search for "# EQUITY SHARES <qty>" in the next ~20 lines
      while (j < lines.length && j - i < 25) {
        const l = lines[j].trim();
        if (!l) { j++; continue; }
        // New ISIN entry = stop
        if (STANDALONE_ISIN_RE.test(l) || CDSL_INLINE_RE.test(l)) break;

        const esMatch = EQUITY_SHARES_RE.exec(l);
        if (esMatch) {
          quantity = parseNum(esMatch[1]) ?? 0;
          found = true;
          j++;

          // Skip balance breakdown (decimal-only lines, up to 12)
          let skipped = 0;
          while (j < lines.length && skipped < 12) {
            const bl = lines[j].trim();
            if (!bl) { j++; continue; }
            if (DECIMAL_ONLY_RE.test(bl)) {
              skipped++;
              j++;
              continue;
            }
            // Price + value line
            const pvMatch = TWO_NUMS_RE.exec(bl);
            if (pvMatch) {
              marketPrice = parseNum(pvMatch[1]);
              value = parseNum(pvMatch[2]) ?? 0;
              j++;
            }
            break;
          }
          break;
        }

        j++;
      }

      if (found && quantity > 0) {
        equities.push({ isin, name, quantity, marketPrice, value });
      }
      i++;
      continue;
    }

    i++;
  }

  return { equities, mutualFunds };
}

export async function parseCASPdf(fileBuffer: Buffer, password: string): Promise<ParsedCAS> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require('pdf-parse') as { PDFParse: new (opts: Record<string, unknown>) => { getText(): Promise<{ text: string }>; destroy(): Promise<void> } };

  const parser = new PDFParse({
    data: fileBuffer,
    ...(password ? { password } : {}),
  });

  let text: string;
  try {
    const result = await parser.getText();
    text = result.text;
  } finally {
    await parser.destroy().catch(() => {});
  }

  const clean = stripPII(text);

  const dateMatch = clean.match(
    /(?:as\s+on|statement\s+date|period)\s*[:\-]?\s*(\d{1,2}[-/ ]\w{2,9}[-/ ]\d{2,4})/i
  );
  const statementDate = dateMatch ? dateMatch[1] : null;

  const lines = clean.split(/\r?\n/);
  const { equities, mutualFunds } = parseAll(lines);

  return { equities, mutualFunds, statementDate };
}
