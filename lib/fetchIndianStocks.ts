import type { PortfolioStock, SheetStock, Verdict, Confidence } from '@/lib/types';
import { getCache, setCache } from '@/lib/cache';

const INDIAN_SHEET_ID = '1ez7O6V_fK-7-s-QSgvZsiw2YJkhyYEi52K1L0rauuFM';
const CACHE_TTL = 5 * 60 * 1000; // 5 min

const INDIAN_WATCHLIST_SHEETS = [
  { sheet: 'Stock Watchlist 2', categoryFallback: 'Defence Stocks' },
  { sheet: 'Stock Watchlist 3', categoryFallback: 'Infrastructure Stocks' },
];

type GoogleCell = { v?: string | number | null; f?: string };
type GoogleTable = {
  cols: { label: string }[];
  rows: { c: Array<GoogleCell | null> }[];
};

function gvizUrl(sheet: string) {
  return `https://docs.google.com/spreadsheets/d/${INDIAN_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheet)}`;
}

async function fetchGvizTable(sheet: string): Promise<GoogleTable> {
  const res = await fetch(gvizUrl(sheet), { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const text = await res.text();
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?$/);
  if (!match) throw new Error(`Unexpected Google Sheets response for "${sheet}"`);

  const parsed = JSON.parse(match[1]);
  if (parsed.status !== 'ok') throw new Error(parsed.errors?.[0]?.detailed_message || `Failed to load "${sheet}"`);
  return parsed.table;
}

const VALID_VERDICTS = new Set(['Strong Buy', 'Buy', 'Watch', 'Hold', 'Reduce', 'Avoid']);
function parseVerdict(val: unknown): Verdict | null {
  if (!val) return null;
  const t = String(val).trim();
  const match = [...VALID_VERDICTS].find(v => v.toLowerCase() === t.toLowerCase());
  return (match as Verdict) ?? null;
}
function parseConfidence(val: unknown): Confidence | null {
  if (!val) return null;
  const t = String(val).trim().toLowerCase();
  if (t === 'high') return 'High';
  if (t === 'medium' || t === 'mid') return 'Medium';
  if (t === 'low') return 'Low';
  return null;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function headerIndex(headers: string[], ...matches: string[]) {
  const lowered = matches.map(normalizeHeader);
  return headers.findIndex(h => lowered.some(m => h.includes(m)));
}

function cellValue(row: Array<GoogleCell | null>, index: number) {
  if (index < 0) return null;
  const cell = row[index];
  return cell?.v ?? cell?.f ?? null;
}

function parseNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = value.toString().replace(/[%,$,₹]/g, '').trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercent(value: unknown): number | null {
  const parsed = parseNumber(value);
  if (parsed == null) return null;
  return Math.abs(parsed) <= 2 ? parsed * 100 : parsed;
}

function normalizeIndianTicker(raw: unknown): string | null {
  if (raw == null) return null;
  const value = raw.toString().trim().toUpperCase();
  if (!value) return null;
  if (value.startsWith('NSE:')) return `${value.slice(4)}.NS`;
  if (value.startsWith('BOM:') || value.startsWith('BSE:')) return `${value.slice(4)}.BO`;
  if (/^\d+$/.test(value)) return `${value}.BO`;
  if (value.endsWith('.NS') || value.endsWith('.BO')) return value;
  return `${value}.NS`;
}

function categoryFromFirstHeader(header: string, fallback: string) {
  return header.replace(/^stock\s+/i, '').trim() || fallback;
}

export async function getIndianPortfolio(forceRefresh = false): Promise<PortfolioStock[]> {
  if (!forceRefresh) {
    const cached = getCache<PortfolioStock[]>('india-portfolio');
    if (cached) return cached;
  }

  const stocks: PortfolioStock[] = [];

  try {
    const table = await fetchGvizTable('Trendlyne portfolio');
    const headers = table.cols.map(col => normalizeHeader(col.label));
    const idxTicker = headerIndex(headers, 'nsecode', 'bsecode', 'stock code');
    const idxName = headerIndex(headers, 'stock name');
    const idxQuantity = headerIndex(headers, 'quantity');
    const idxAvgBuyPrice = headerIndex(headers, 'avg. buy price', 'avg buy price', 'purchase price');
    const idxInvested = headerIndex(headers, 'invested amount', 'starting value', 'invested value');

    for (const row of table.rows) {
      const values = row.c;
      const ticker = normalizeIndianTicker(cellValue(values, idxTicker));
      if (!ticker) continue;

      const quantity = parseNumber(cellValue(values, idxQuantity)) ?? 0;
      const avgBuyPrice = parseNumber(cellValue(values, idxAvgBuyPrice)) ?? 0;
      let investedValue = parseNumber(cellValue(values, idxInvested)) ?? 0;
      if (!investedValue && quantity > 0 && avgBuyPrice > 0) {
        investedValue = quantity * avgBuyPrice;
      }

      stocks.push({
        ticker,
        name: cellValue(values, idxName)?.toString().trim() || ticker,
        quantity,
        avgBuyPrice,
        investedValue,
      });
    }
  } catch (error) {
    console.error('Failed to fetch Indian portfolio:', error);
  }

  setCache('india-portfolio', stocks, CACHE_TTL);
  return stocks;
}

export async function getIndianWatchlist(forceRefresh = false): Promise<SheetStock[]> {
  if (!forceRefresh) {
    const cached = getCache<SheetStock[]>('india-watchlist');
    if (cached) return cached;
  }

  const allStocks: SheetStock[] = [];

  await Promise.allSettled(
    INDIAN_WATCHLIST_SHEETS.map(async ({ sheet, categoryFallback }) => {
      const table = await fetchGvizTable(sheet);
      const headers = table.cols.map(col => normalizeHeader(col.label));
      const rawHeaders = table.cols.map(col => col.label);
      const idxTicker = headerIndex(headers, 'stock code');
      const idxCurrentPrice = headerIndex(headers, 'current price');
      const idxFairPrice = headerIndex(headers, 'fair price', 'intrinsic price');
      const idxPotential = headerIndex(headers, 'potential gain/fall');
      const idx1W = headerIndex(headers, '1 week');
      const idx1M = headerIndex(headers, '1 month');
      const idx6M = headerIndex(headers, '6 month');
      const idx1Y = headerIndex(headers, '1 year');
      const idx3Y = headerIndex(headers, '3 year');
      const idxVerdict = headerIndex(headers, 'verdict');
      const idxConfidence = headerIndex(headers, 'confidence');
      const category = categoryFromFirstHeader(rawHeaders[0] || '', categoryFallback);

      for (const row of table.rows) {
        const values = row.c;
        const ticker = normalizeIndianTicker(cellValue(values, idxTicker));
        if (!ticker) continue;

        allStocks.push({
          ticker,
          name: cellValue(values, 0)?.toString().trim() || ticker,
          category,
          sheetTab: sheet,
          description: '',
          marketCapSheet: null,
          currentPriceSheet: parseNumber(cellValue(values, idxCurrentPrice)),
          fairPrice: parseNumber(cellValue(values, idxFairPrice)),
          potentialGain: parsePercent(cellValue(values, idxPotential)),
          gain1W: parsePercent(cellValue(values, idx1W)),
          gain1M: parsePercent(cellValue(values, idx1M)),
          gain6M: parsePercent(cellValue(values, idx6M)),
          gain1Y: parsePercent(cellValue(values, idx1Y)),
          gain3Y: parsePercent(cellValue(values, idx3Y)),
          verdict: parseVerdict(idxVerdict >= 0 ? cellValue(values, idxVerdict) : null),
          confidence: parseConfidence(idxConfidence >= 0 ? cellValue(values, idxConfidence) : null),
          region: 'INDIA',
        });
      }
    })
  );

  const seen = new Set<string>();
  const deduped = allStocks.filter(stock => {
    if (seen.has(stock.ticker)) return false;
    seen.add(stock.ticker);
    return true;
  });

  setCache('india-watchlist', deduped, CACHE_TTL);
  return deduped;
}
