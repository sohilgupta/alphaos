// lib/nsdl.ts
// Read NSDL CAS net-worth time-series + projections from Google Sheets,
// and (when running locally) the latest parsed CAS holdings from disk.

import { getCache, setCache } from '@/lib/cache';

const NSDL_SHEET_ID = '1KOEZQrDc2SfLJovngTLQ3pacevJu5rUQ';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour — sheet is hand-updated monthly

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface NsdlMonthPoint {
  date: string;            // ISO yyyy-mm-dd
  value: number;           // ₹
  change: number | null;   // ₹ vs prior month
  changePct: number | null;// percent vs prior month
}

export interface NsdlYearProjection {
  yearOffset: number;      // 1, 2, 3 …
  yearLabel: string;       // calendar year, e.g. 2027
  value: number;
}

export interface NsdlMilestone {
  label: string;           // "₹1 Cr", "₹10 Cr", "₹100 Cr"
  amount: number;
  yearsAway: number | null;
}

export interface NsdlSummary {
  currentValue: number;
  peakValue: number;
  peakDate: string;
  startValue: number;
  startDate: string;
  cagrPct: number;
  totalReturnPct: number;
  monthsTracked: number;
  // Computed milestones, in years from now (positive = future, null = unreachable)
  milestones: NsdlMilestone[];
}

export type NsdlHoldingType =
  | 'equity' | 'mutual_fund' | 'bond' | 'government_security'
  | 'money_market' | 'securitised_instrument' | 'alternate_investment_fund'
  | 'nps' | 'zero_coupon_zero_principal' | 'other';

export interface NsdlHolding {
  name: string;
  type: NsdlHoldingType;
  value: number;            // ₹
}

export interface NsdlData {
  summary: NsdlSummary;
  history: NsdlMonthPoint[];
  yearlyProjection: NsdlYearProjection[];
  latestHoldings: NsdlHolding[];
  latestSnapshotDate: string | null;
  latestSnapshotTotal: number | null;
  generatedAt: number;
}

// ─── gviz reader (same pattern as fetchIndianStocks.ts) ────────────────────────
type GoogleCell = { v?: string | number | null; f?: string };
type GoogleTable = {
  cols: { label: string }[];
  rows: { c: Array<GoogleCell | null> }[];
};

function gvizUrl(sheet: string) {
  return `https://docs.google.com/spreadsheets/d/${NSDL_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheet)}`;
}

async function fetchGvizTable(sheet: string): Promise<GoogleTable> {
  const res = await fetch(gvizUrl(sheet), { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for sheet "${sheet}"`);
  const text = await res.text();
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) throw new Error(`Unexpected gviz response for "${sheet}"`);
  const parsed = JSON.parse(match[1]);
  if (parsed.status !== 'ok') {
    throw new Error(parsed.errors?.[0]?.detailed_message || `Failed to load "${sheet}"`);
  }
  return parsed.table;
}

function cellNum(c: GoogleCell | null): number | null {
  if (!c) return null;
  if (typeof c.v === 'number') return Number.isFinite(c.v) ? c.v : null;
  if (typeof c.v === 'string') {
    const n = Number.parseFloat(c.v.replace(/[,₹]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// gviz dates come back as "Date(2015,3,1)" (month is 0-indexed)
function cellDate(c: GoogleCell | null): string | null {
  if (!c?.v) return null;
  const v = String(c.v);
  const m = v.match(/Date\((\d+),(\d+),(\d+)\)/);
  if (m) {
    const y = +m[1], mo = +m[2] + 1, d = +m[3];
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  // Fallback: try Date.parse
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

// ─── Parsers ───────────────────────────────────────────────────────────────────
async function fetchHistory(): Promise<NsdlMonthPoint[]> {
  const table = await fetchGvizTable('nsdl_cas');
  const points: NsdlMonthPoint[] = [];

  for (const row of table.rows) {
    const date = cellDate(row.c[0]);
    const value = cellNum(row.c[1]);
    if (!date || value == null || value <= 0) continue;
    const change = cellNum(row.c[3]);
    const changePct = cellNum(row.c[5]);
    points.push({
      date,
      value,
      change,
      changePct: changePct != null ? changePct * 100 : null, // gviz returns 0.05 for 5%
    });
  }

  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

async function fetchYearlyProjection(): Promise<NsdlYearProjection[]> {
  const table = await fetchGvizTable('projections_year');
  const out: NsdlYearProjection[] = [];
  const nowYear = new Date().getFullYear();

  for (const row of table.rows) {
    const offset = cellNum(row.c[0]);
    const value = cellNum(row.c[1]);
    if (offset == null || value == null) continue;
    if (offset < 1 || offset > 50) continue;
    out.push({
      yearOffset: Math.round(offset),
      yearLabel: String(nowYear + Math.round(offset)),
      value,
    });
  }

  out.sort((a, b) => a.yearOffset - b.yearOffset);
  return out;
}

// ─── Derived metrics ───────────────────────────────────────────────────────────
function yearsBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  return (b - a) / (1000 * 60 * 60 * 24 * 365.25);
}

function computeSummary(history: NsdlMonthPoint[]): NsdlSummary {
  if (history.length === 0) {
    return {
      currentValue: 0, peakValue: 0, peakDate: '',
      startValue: 0, startDate: '',
      cagrPct: 0, totalReturnPct: 0, monthsTracked: 0,
      milestones: [],
    };
  }
  const first = history[0];
  const last = history[history.length - 1];
  let peak = first;
  for (const p of history) if (p.value > peak.value) peak = p;

  const years = yearsBetween(first.date, last.date) || 1;
  const cagr = (Math.pow(last.value / first.value, 1 / years) - 1) * 100;
  const totalReturn = ((last.value - first.value) / first.value) * 100;

  // Milestones — at the realised CAGR, when do we hit the next round numbers?
  // We list a ladder of targets and only return the ones not yet reached, so
  // the UI shows what's still ahead rather than already-checked-off items.
  // Reach 10 Cr → next list shows 20 / 50 / 100 / 250. Reach 250 → 500 / 1000.
  const allTargets = [
    { label: '₹1 Cr',    amount: 1e7  },
    { label: '₹2 Cr',    amount: 2e7  },
    { label: '₹5 Cr',    amount: 5e7  },
    { label: '₹10 Cr',   amount: 1e8  },
    { label: '₹20 Cr',   amount: 2e8  },
    { label: '₹50 Cr',   amount: 5e8  },
    { label: '₹100 Cr',  amount: 1e9  },
    { label: '₹250 Cr',  amount: 2.5e9 },
    { label: '₹500 Cr',  amount: 5e9  },
    { label: '₹1000 Cr', amount: 1e10 },
  ];
  const r = cagr / 100;
  // Keep only unreached targets, capped at the next 4 so the UI stays tight.
  const upcoming = allTargets.filter(t => last.value < t.amount).slice(0, 4);
  const milestones: NsdlMilestone[] = upcoming.map(t => {
    if (r <= 0) return { ...t, yearsAway: null };
    const y = Math.log(t.amount / last.value) / Math.log(1 + r);
    return { ...t, yearsAway: Math.max(0, y) };
  });

  return {
    currentValue: last.value,
    peakValue: peak.value,
    peakDate: peak.date,
    startValue: first.value,
    startDate: first.date,
    cagrPct: cagr,
    totalReturnPct: totalReturn,
    monthsTracked: history.length,
    milestones,
  };
}

// ─── Latest holdings (Google Sheet — works on Vercel) ────────────────────────
// The NSDL net-worth sheet (1KOE…) is uploaded .xlsx so we can't write to it.
// Holdings get sync'd to the native India sheet (1ez7…) under `nsdl_holdings`
// by `python nsdl_cas/scripts/sync_holdings_to_sheet.py`.
const INDIA_SHEET_ID = '1ez7O6V_fK-7-s-QSgvZsiw2YJkhyYEi52K1L0rauuFM';
const HOLDINGS_TAB = 'nsdl_holdings';

async function fetchGvizFromSheet(sheetId: string, tab: string): Promise<GoogleTable> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${tab}`);
  const text = await res.text();
  const m = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
  if (!m) throw new Error(`Unexpected gviz response for ${tab}`);
  const parsed = JSON.parse(m[1]);
  if (parsed.status !== 'ok') throw new Error(parsed.errors?.[0]?.detailed_message || `Failed: ${tab}`);
  return parsed.table;
}

async function loadLatestHoldings(): Promise<{
  holdings: NsdlHolding[];
  snapshotDate: string | null;
  snapshotTotal: number | null;
}> {
  try {
    const table = await fetchGvizFromSheet(INDIA_SHEET_ID, HOLDINGS_TAB);
    // Columns (from sync script): snapshot_date | asset_name | asset_type | value
    const holdings: NsdlHolding[] = [];
    let snapshotDate: string | null = null;
    for (const row of table.rows) {
      const date = row.c[0]?.v != null ? cellDate(row.c[0]) || String(row.c[0]?.v) : null;
      const name = row.c[1]?.v;
      const type = row.c[2]?.v;
      const value = cellNum(row.c[3]);
      if (!name || value == null) continue;
      holdings.push({
        name: String(name).trim(),
        type: (String(type || 'other') as NsdlHoldingType),
        value,
      });
      if (!snapshotDate && date) snapshotDate = date;
    }
    holdings.sort((a, b) => b.value - a.value);
    const snapshotTotal = holdings.reduce((s, h) => s + h.value, 0);
    return { holdings, snapshotDate, snapshotTotal: holdings.length ? snapshotTotal : null };
  } catch (e) {
    console.warn('loadLatestHoldings (sheet) failed:', e);
    return { holdings: [], snapshotDate: null, snapshotTotal: null };
  }
}

// ─── Public entry ──────────────────────────────────────────────────────────────
export async function getNsdlData(forceRefresh = false): Promise<NsdlData> {
  if (!forceRefresh) {
    const cached = await getCache<NsdlData>('nsdl-data');
    if (cached) return cached;
  }

  const [history, yearlyProjection, latest] = await Promise.all([
    fetchHistory(),
    fetchYearlyProjection(),
    loadLatestHoldings(),
  ]);

  const summary = computeSummary(history);
  const data: NsdlData = {
    summary,
    history,
    yearlyProjection,
    latestHoldings: latest.holdings,
    latestSnapshotDate: latest.snapshotDate,
    latestSnapshotTotal: latest.snapshotTotal,
    generatedAt: Date.now(),
  };
  await setCache('nsdl-data', data, CACHE_TTL);
  return data;
}
