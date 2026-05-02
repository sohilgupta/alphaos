import type { CASEquityHolding, CASMutualFund, ParsedCAS } from './types';
import { createRequire } from 'module';

const PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;

function stripPII(text: string): string {
  return text.replace(PAN_RE, '[PAN_REDACTED]');
}

function parseNum(s: string): number {
  return parseFloat(s.replace(/,/g, ''));
}

// ─── Regex patterns ────────────────────────────────────────────────────────────
// ISIN at the start of a line, possibly glued to the next token (NSDL) or
// followed by space (CDSL).
const ISIN_AT_START_RE = /^(IN[EF][A-Z0-9]{8}[0-9])/;

// NSDL equity row: ISIN<glued>NAME <facevalue> <qty> <price> <value>
//   e.g. "INE918I01026BAJAJ FINSERV LIMITED 1.00 650 1,631.80 10,60,670.00"
//   facevalue: \d+\.\d{2}, qty: integer or decimal, price: \d+\.\d{2}, value: \d+\.\d{2}
const NSDL_EQUITY_RE = /^(IN[EF][A-Z0-9]{8}[0-9])(.+?)\s+(\d+\.\d{2})\s+([\d,]+(?:\.\d+)?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/;

// NSDL ticker line — usually `<TICKER>.NSE` or `<TICKER>.BSE`, sometimes with
// trailing name continuation: e.g. "BAJAJHFL.NSE LIMITED"
const NSDL_TICKER_RE = /^([A-Z0-9\-&]+)\.(NSE|BSE)(?:\s+(.+))?$/;

// CDSL equity row: ISIN <NAME glued to qty> <safekeep_bal>(\d+\.\d{3}) <pledged_bal>(\d+\.\d{3}) <price>(\d+\.\d{2}) <value>(\d+\.\d{2})
//   e.g. "INE216P01012 AAVAS FINANCIERS LIMITED20.0000.0000.0001,078.90 21,578.00"
//   The qty is glued to the name end. Pattern: name<qty.000><0.000><0.000><price.NN> <value.NN>
const CDSL_EQUITY_RE = /^(IN[EF][A-Z0-9]{8}[0-9])\s+(.+?)([\d,]+\.\d{3})([\d,]+\.\d{3})([\d,]+\.\d{3})([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/;

// MF row: ISIN<glued>SCHEME<glued>FOLIO <units 3-dec> <avgcost 4-dec> <totalcost 2-dec> <NAV 4-dec> <value 2-dec> <pnl 2-dec> <return 2-dec>
//   e.g. "INF846K015J4AXIS SILVER9016013774 2,524.819 39.6261 1,00,048.73 40.2214 1,01,551.75 1,503.02 7.60"
//   Folio is 10+ digits. Units/avgcost may be space-separated OR glued.
const MF_RE = /^(INF[A-Z0-9]{8}[0-9])(.+?)(\d{10,})\s+([\d,]+\.\d{3})\s*([\d,]+\.\d{4})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{4})\s+([\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s*$/;

// ─── Parser ────────────────────────────────────────────────────────────────────
function parseAll(lines: string[]): {
  equities: CASEquityHolding[];
  mutualFunds: CASMutualFund[];
} {
  const equities: CASEquityHolding[] = [];
  // Aggregate MFs by ISIN+scheme so that multi-folio holdings collapse into one row
  const mfByKey = new Map<string, CASMutualFund>();

  // Collect MF continuation lines (lines without ISIN that follow an MF row).
  // Limit to a small window so we don't sweep up unrelated trailing text.
  let lastMfKey: string | null = null;
  let mfContinuationCount = 0;
  const MAX_MF_CONTINUATION_LINES = 2;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // ── NSDL Equity ─────────────────────────────────────────────────────────
    const nsdlMatch = NSDL_EQUITY_RE.exec(line);
    if (nsdlMatch) {
      const [, isin, rawName, /* faceValue */, qtyStr, priceStr, valueStr] = nsdlMatch;
      let name = rawName.trim();

      // Look at next line for ticker
      let ticker: string | undefined;
      const next = lines[i + 1]?.trim() ?? '';
      const tickerMatch = NSDL_TICKER_RE.exec(next);
      if (tickerMatch) {
        const [, sym, exch, nameTail] = tickerMatch;
        ticker = `${sym}.${exch === 'NSE' ? 'NS' : 'BO'}`;
        if (nameTail) name = `${name} ${nameTail}`.replace(/\s+/g, ' ').trim();
        i++; // consume ticker line
      }

      const quantity = parseNum(qtyStr);
      const marketPrice = parseNum(priceStr);
      const value = parseNum(valueStr);
      if (quantity > 0) {
        equities.push({ isin, name, quantity, marketPrice, value, ticker });
      }
      lastMfKey = null;
      continue;
    }

    // ── CDSL Equity ─────────────────────────────────────────────────────────
    const cdslMatch = CDSL_EQUITY_RE.exec(line);
    if (cdslMatch) {
      const [, isin, rawName, qtyStr, , , priceStr, valueStr] = cdslMatch;
      const name = rawName.trim().replace(/\s+/g, ' ');
      const quantity = parseNum(qtyStr);
      const marketPrice = parseNum(priceStr);
      const value = parseNum(valueStr);
      if (quantity > 0) {
        equities.push({ isin, name, quantity, marketPrice, value });
      }
      lastMfKey = null;
      continue;
    }

    // ── Mutual Fund ─────────────────────────────────────────────────────────
    const mfMatch = MF_RE.exec(line);
    if (mfMatch) {
      const [, isin, rawScheme, , unitsStr, , , navStr, valueStr] = mfMatch;
      const scheme = rawScheme.trim().replace(/\s+/g, ' ');
      const units = parseNum(unitsStr);
      const nav = parseNum(navStr);
      const value = parseNum(valueStr);

      const key = `${isin}|${scheme}`;
      const existing = mfByKey.get(key);
      if (existing) {
        existing.units += units;
        existing.value += value;
      } else {
        mfByKey.set(key, { isin, schemeName: scheme, units, nav, value });
      }
      lastMfKey = key;
      mfContinuationCount = 0;
      continue;
    }

    // ── Continuation line for last MF (scheme name spans multiple lines) ───
    if (lastMfKey && mfContinuationCount < MAX_MF_CONTINUATION_LINES && !ISIN_AT_START_RE.test(line)) {
      const mf = mfByKey.get(lastMfKey)!;
      const cleaned = line.replace(/^NOT\s+AVAILABLE\s+/i, '').trim();
      if (cleaned && !/^[\d.,\s%-]+$/.test(cleaned) && cleaned.length < 60) {
        if (!mf.schemeName.toLowerCase().includes(cleaned.toLowerCase().slice(0, 10))) {
          mf.schemeName = `${mf.schemeName} ${cleaned}`.replace(/\s+/g, ' ').trim();
        }
      }
      mfContinuationCount++;
      continue;
    }

    lastMfKey = null;
    mfContinuationCount = 0;
  }

  return { equities, mutualFunds: Array.from(mfByKey.values()) };
}

// pdfjs-dist legacy build references browser globals at module load time
// (DOMMatrix, Path2D, ImageData). Node.js doesn't define these. Stub them
// before the dynamic import so the module evaluates cleanly. Only canvas
// rendering uses these — text extraction works without real implementations.
function ensurePdfjsGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  class StubMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    constructor(_init?: unknown) {}
    multiply() { return new StubMatrix(); }
    translate() { return new StubMatrix(); }
    scale() { return new StubMatrix(); }
    rotate() { return new StubMatrix(); }
    invertSelf() { return this; }
  }
  if (typeof g.DOMMatrix === 'undefined') g.DOMMatrix = StubMatrix;
  if (typeof g.Path2D === 'undefined') g.Path2D = class { addPath() {} closePath() {} moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} arc() {} rect() {} };
  if (typeof g.ImageData === 'undefined') {
    g.ImageData = class {
      data: Uint8ClampedArray; width: number; height: number;
      constructor(w: number | Uint8ClampedArray, h: number, _opts?: unknown) {
        if (w instanceof Uint8ClampedArray) { this.data = w; this.width = h; this.height = (w.length / (h * 4)) | 0; }
        else { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); }
      }
    };
  }
}

async function extractPdfText(fileBuffer: Buffer, password: string): Promise<string> {
  ensurePdfjsGlobals();

  // Use pdfjs-dist/legacy directly — avoids worker-path issues that pdf-parse
  // encounters when bundled in Next.js serverless functions.
  const _require = createRequire(import.meta.url);
  const workerPath: string = _require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(fileBuffer),
    ...(password ? { password } : {}),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    type Item = { str?: string; transform?: number[] };
    const items = (content.items as Item[]).filter(it => it.transform);

    // Group items by Y coordinate so items on the same line are joined.
    // Within each line, sort by X and concatenate.
    const lineMap = new Map<number, Item[]>();
    for (const it of items) {
      const y = Math.round(it.transform![5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push(it);
    }
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
    const lines: string[] = [];
    for (const y of sortedYs) {
      const lineItems = lineMap.get(y)!.sort((a, b) => a.transform![4] - b.transform![4]);
      const text = lineItems.map(it => it.str ?? '').join('').replace(/\s+/g, ' ').trim();
      if (text) lines.push(text);
    }
    pageTexts.push(lines.join('\n'));
    page.cleanup();
  }

  await pdf.destroy();
  return pageTexts.join('\n');
}

export async function parseCASPdf(fileBuffer: Buffer, password: string): Promise<ParsedCAS> {
  const text = await extractPdfText(fileBuffer, password);
  const clean = stripPII(text);

  const dateMatch = clean.match(
    /(?:as\s+on|statement\s+date|period)\s*[:\-]?\s*(\d{1,2}[-/ ]\w{2,9}[-/ ]\d{2,4})/i
  );
  const statementDate = dateMatch ? dateMatch[1] : null;

  const lines = clean.split(/\r?\n/);
  const { equities, mutualFunds } = parseAll(lines);

  return { equities, mutualFunds, statementDate };
}
