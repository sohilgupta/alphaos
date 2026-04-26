// lib/google-sheets.ts
// Fetches and parses stock data from Google Sheets CSV export

import Papa from 'papaparse';
import { SheetStock } from './types';

const SHEET_ID = '1HVEG6wtWsm68o3YMgznhhLrlENOARqF41kqrcbJlqq4';

// Each tab in the sheet
export const SHEET_TABS = [
  { name: 'AI & Tech', gid: null },       // default tab (no gid param)
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

    // Detect header row
    if (!headerFound && firstCell.toLowerCase() === 'category') {
      headerRow = row.map(c => c.toLowerCase().trim());
      headerFound = true;
      continue;
    }

    if (!headerFound) continue;

    // Category row: first cell non-empty, second cell empty
    if (firstCell && !secondCell) {
      currentCategory = firstCell;
      continue;
    }

    // Stock row: first cell empty, second cell is ticker
    if (!firstCell && secondCell) {
      const ticker = secondCell.toUpperCase();
      // Skip ETFs and invalid tickers longer than 5 chars 
      if (!ticker || ticker.length > 6) continue;

      const name = row[2] || '';
      const description = row[3] || '';

      // Column indices based on header
      const idxMarketCap = headerRow.findIndex(h => h.includes('market cap'));
      const idxCurrentPrice = headerRow.findIndex(h => h.includes('current price'));
      const idxFairPrice = headerRow.findIndex(h => h.includes('fair price') || (h.includes('fair') && !h.includes('gain')));
      const idxPotential = headerRow.findIndex(h => h.includes('potential'));
      const idx1W = headerRow.findIndex(h => h.includes('1 w') || h === '1w gain' || h.includes('1 week'));
      const idx1M = headerRow.findIndex(h => h.includes('1 m') || h === '1m gain' || h.includes('1 month'));
      const idx6M = headerRow.findIndex(h => h.includes('6 m') || h === '6m gain' || h.includes('6 month'));
      const idx1Y = headerRow.findIndex(h => h.includes('1 y') || h === '1y gain' || h.includes('1 year'));
      const idx3Y = headerRow.findIndex(h => h.includes('3 y') || h === '3y gain' || h.includes('3 year'));

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
      });
    }
  }

  return stocks;
}

let _cache: { stocks: SheetStock[]; fetchedAt: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function fetchAllSheetStocks(forceRefresh = false): Promise<SheetStock[]> {
  if (!forceRefresh && _cache && Date.now() - _cache.fetchedAt < CACHE_TTL) {
    return _cache.stocks;
  }

  const allStocks: SheetStock[] = [];

  await Promise.allSettled(
    SHEET_TABS.map(async (tab) => {
      try {
        const url = csvUrl(tab.gid);
        const res = await fetch(url, { next: { revalidate: 600 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const stocks = parseTabCsv(text, tab.name);
        allStocks.push(...stocks);
      } catch (e) {
        console.error(`Failed to fetch tab "${tab.name}":`, e);
      }
    })
  );

  // Deduplicate by ticker (keep first occurrence)
  const seen = new Set<string>();
  const deduped = allStocks.filter(s => {
    if (seen.has(s.ticker)) return false;
    seen.add(s.ticker);
    return true;
  });

  _cache = { stocks: deduped, fetchedAt: Date.now() };
  return deduped;
}

export function getAllCategories(stocks: SheetStock[]): string[] {
  const cats = [...new Set(stocks.map(s => s.category).filter(Boolean))];
  return cats.sort();
}

export function getAllTabs(stocks: SheetStock[]): string[] {
  return [...new Set(stocks.map(s => s.sheetTab).filter(Boolean))];
}

const PORTFOLIO_SHEET_ID = '1ez7O6V_fK-7-s-QSgvZsiw2YJkhyYEi52K1L0rauuFM';
const PORTFOLIO_GID = '1252642298';
let _portfolioCache: { stocks: import('./types').PortfolioStock[]; fetchedAt: number } | null = null;

export async function fetchPortfolioStocks(forceRefresh = false): Promise<import('./types').PortfolioStock[]> {
  if (!forceRefresh && _portfolioCache && Date.now() - _portfolioCache.fetchedAt < CACHE_TTL) {
    return _portfolioCache.stocks;
  }

  const url = `https://docs.google.com/spreadsheets/d/${PORTFOLIO_SHEET_ID}/export?format=csv&gid=${PORTFOLIO_GID}`;
  const stocks: import('./types').PortfolioStock[] = [];

  try {
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    
    if (text.trim().startsWith('<')) {
      console.warn('Portfolio sheet is private or restricted. Please make it public "Anyone with the link can view".');
      return [];
    }

    const result = Papa.parse<string[]>(text, {
      skipEmptyLines: true,
      header: true,
    });

    const rows = result.data as any[];

    for (const row of rows) {
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

      stocks.push({
        ticker,
        name: name.toString().trim(),
        quantity,
        avgBuyPrice,
        investedValue,
      });
    }

  } catch (e) {
    console.error(`Failed to fetch portfolio:`, e);
  }

  _portfolioCache = { stocks, fetchedAt: Date.now() };
  return stocks;
}
