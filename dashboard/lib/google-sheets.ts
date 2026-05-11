// lib/google-sheets.ts
// Fetches and parses stock data from Google Sheets CSV export

import Papa from 'papaparse';
import { SheetStock, Verdict, Confidence } from './types';
import { getCache, setCache } from './cache';

const VALID_VERDICTS = new Set(['Strong Buy', 'Buy', 'Watch', 'Hold', 'Reduce', 'Avoid']);

function parseVerdict(val: string | undefined): Verdict | null {
  if (!val) return null;
  const trimmed = val.trim();
  // Case-insensitive match
  const match = [...VALID_VERDICTS].find(v => v.toLowerCase() === trimmed.toLowerCase());
  return (match as Verdict) ?? null;
}

function parseConfidence(val: string | undefined): Confidence | null {
  if (!val) return null;
  const t = val.trim().toLowerCase();
  if (t === 'high') return 'High';
  if (t === 'medium' || t === 'mid') return 'Medium';
  if (t === 'low') return 'Low';
  return null;
}

const SHEET_ID = '1HVEG6wtWsm68o3YMgznhhLrlENOARqF41kqrcbJlqq4';
const WATCHLIST_TTL = 10 * 60 * 1000; // 10 min

export const SHEET_TABS = [
  { name: 'AI & Tech', gid: null },
  { name: 'Space & Energy', gid: '612209168' },
];

function csvUrl(gid: string | null): string {
  const base = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
  return gid ? `${base}&gid=${gid}` : base;
}

function parsePercent(val: string | undefined): number | null {
  if (!val || val === '#N/A' || val === '-' || val.trim() === '') return null;
  const cleaned = val.replace('%', '').replace(',', '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseNumber(val: string | undefined): number | null {
  if (!val || val === '#N/A' || val === '-' || val.trim() === '') return null;
  const cleaned = val.replace(/[$,]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseTabCsv(csvText: string, tabName: string): SheetStock[] {
  const result = Papa.parse<string[]>(csvText, {
    skipEmptyLines: false,
    header: false,
  });

  const rows = result.data as string[][];
  const stocks: SheetStock[] = [];

  let currentCategory = '';
  let headerRow: string[] = [];
  let headerFound = false;

  for (const row of rows) {
    if (!row || row.length === 0) continue;

    const firstCell = (row[0] || '').trim();
    const secondCell = (row[1] || '').trim();

    if (!headerFound && firstCell.toLowerCase() === 'category') {
      headerRow = row.map(c => c.toLowerCase().trim());
      headerFound = true;
      continue;
    }

    if (!headerFound) continue;

    if (firstCell && !secondCell) {
      currentCategory = firstCell;
      continue;
    }

    if (!firstCell && secondCell) {
      const ticker = secondCell.toUpperCase();
      if (!ticker || ticker.length > 6) continue;

      const name = row[2] || '';
      const description = row[3] || '';

      const idxMarketCap = headerRow.findIndex(h => h.includes('market cap'));
      const idxCurrentPrice = headerRow.findIndex(h => h.includes('current price'));
      const idxFairPrice = headerRow.findIndex(h => h.includes('fair price') || (h.includes('fair') && !h.includes('gain')));
      const idxPotential = headerRow.findIndex(h => h.includes('potential'));
      const idx1W = headerRow.findIndex(h => h.includes('1 w') || h === '1w gain' || h.includes('1 week'));
      const idx1M = headerRow.findIndex(h => h.includes('1 m') || h === '1m gain' || h.includes('1 month'));
      const idx6M = headerRow.findIndex(h => h.includes('6 m') || h === '6m gain' || h.includes('6 month'));
      const idx1Y = headerRow.findIndex(h => h.includes('1 y') || h === '1y gain' || h.includes('1 year'));
      const idx3Y = headerRow.findIndex(h => h.includes('3 y') || h === '3y gain' || h.includes('3 year'));
      const idxVerdict = headerRow.findIndex(h => h.includes('verdict'));
      const idxConfidence = headerRow.findIndex(h => h.includes('confidence'));

      stocks.push({
        ticker,
        name: name.trim(),
        category: currentCategory,
        sheetTab: tabName,
        description: description.trim(),
        marketCapSheet: parseNumber(idxMarketCap >= 0 ? row[idxMarketCap] : undefined),
        currentPriceSheet: parseNumber(idxCurrentPrice >= 0 ? row[idxCurrentPrice] : undefined),
        fairPrice: parseNumber(idxFairPrice >= 0 ? row[idxFairPrice] : undefined),
        potentialGain: parsePercent(idxPotential >= 0 ? row[idxPotential] : undefined),
        gain1W: parsePercent(idx1W >= 0 ? row[idx1W] : undefined),
        gain1M: parsePercent(idx1M >= 0 ? row[idx1M] : undefined),
        gain6M: parsePercent(idx6M >= 0 ? row[idx6M] : undefined),
        gain1Y: parsePercent(idx1Y >= 0 ? row[idx1Y] : undefined),
        gain3Y: parsePercent(idx3Y >= 0 ? row[idx3Y] : undefined),
        verdict: parseVerdict(idxVerdict >= 0 ? row[idxVerdict] : undefined),
        confidence: parseConfidence(idxConfidence >= 0 ? row[idxConfidence] : undefined),
        region: 'US',
      });
    }
  }

  return stocks;
}

export async function fetchAllSheetStocks(forceRefresh = false): Promise<SheetStock[]> {
  if (!forceRefresh) {
    const cached = getCache<SheetStock[]>('us-watchlist');
    if (cached) return cached;
  }

  const allStocks: SheetStock[] = [];

  await Promise.allSettled(
    SHEET_TABS.map(async (tab) => {
      try {
        const res = await fetch(csvUrl(tab.gid), { next: { revalidate: 600 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        allStocks.push(...parseTabCsv(text, tab.name));
      } catch (e) {
        console.error(`Failed to fetch tab "${tab.name}":`, e);
      }
    })
  );

  const seen = new Set<string>();
  const deduped = allStocks.filter(s => {
    if (seen.has(s.ticker)) return false;
    seen.add(s.ticker);
    return true;
  });

  setCache('us-watchlist', deduped, WATCHLIST_TTL);
  return deduped;
}

export function getAllCategories(stocks: SheetStock[]): string[] {
  return [...new Set(stocks.map(s => s.category).filter(Boolean))].sort();
}

export function getAllTabs(stocks: SheetStock[]): string[] {
  return [...new Set(stocks.map(s => s.sheetTab).filter(Boolean))];
}

const PORTFOLIO_SHEET_ID = '1ez7O6V_fK-7-s-QSgvZsiw2YJkhyYEi52K1L0rauuFM';
const PORTFOLIO_GID = '1252642298';

export async function fetchPortfolioStocks(forceRefresh = false): Promise<import('./types').PortfolioStock[]> {
  if (!forceRefresh) {
    const cached = getCache<import('./types').PortfolioStock[]>('us-portfolio');
    if (cached) return cached;
  }

  const url = `https://docs.google.com/spreadsheets/d/${PORTFOLIO_SHEET_ID}/export?format=csv&gid=${PORTFOLIO_GID}`;
  const stocks: import('./types').PortfolioStock[] = [];

  try {
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    if (text.trim().startsWith('<')) {
      console.warn('Portfolio sheet is private. Make it "Anyone with the link can view".');
      return [];
    }

    const result = Papa.parse<Record<string, string | undefined>>(text, {
      skipEmptyLines: true,
      header: true,
    });

    for (const row of result.data) {
      const tickerRaw = row['Stock Code'] || row['Stock code'] || row['stock code'];
      if (!tickerRaw) continue;

      const ticker = tickerRaw.toString().toUpperCase().trim();
      if (!ticker) continue;

      const name = row['Stock'] || ticker;
      const quantity = parseNumber(row['Quantity']) ?? 0;
      const avgBuyPrice = parseNumber(row['Purchase price']) ?? 0;
      let investedValue = parseNumber(row['Starting Value']) ?? 0;
      if (investedValue === 0 && quantity > 0 && avgBuyPrice > 0) {
        investedValue = quantity * avgBuyPrice;
      }

      // New columns added to US_portfolio: Fair price, Upside, Verdict, Confidence
      const fairPrice = parseNumber(row['Fair price'] ?? row['Fair Price'] ?? row['fair price']);
      const potentialGain = parsePercent(row['Upside'] ?? row['Potential gain'] ?? row['Potential Gain']);
      const verdict = parseVerdict(row['Verdict'] ?? row['verdict']);
      const confidence = parseConfidence(row['Confidence'] ?? row['confidence']);

      stocks.push({
        ticker,
        name: name.toString().trim(),
        quantity,
        avgBuyPrice,
        investedValue,
        fairPrice,
        potentialGain,
        verdict,
        confidence,
      });
    }
  } catch (e) {
    console.error('Failed to fetch portfolio:', e);
  }

  setCache('us-portfolio', stocks, WATCHLIST_TTL);
  return stocks;
}
