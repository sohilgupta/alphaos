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

  // Milestones — at the realised CAGR, when do we hit 1 Cr / 10 Cr / 100 Cr?
  const targets = [
    { label: '₹1 Cr',   amount: 1e7 },
    { label: '₹10 Cr',  amount: 1e8 },
    { label: '₹50 Cr',  amount: 5e8 },
    { label: '₹100 Cr', amount: 1e9 },
  ];
  const r = cagr / 100;
  const milestones: NsdlMilestone[] = targets.map(t => {
    if (last.value >= t.amount) return { ...t, yearsAway: 0 };
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

// ─── Latest holdings (local file system; not available on Vercel) ─────────────
async function loadLatestHoldings(): Promise<{
  holdings: NsdlHolding[];
  snapshotDate: string | null;
  snapshotTotal: number | null;
}> {
  // Only try this on the server. On Vercel, vault/ won't exist next to the
  // dashboard/ root directory and we just return empty.
  if (typeof window !== 'undefined') {
    return { holdings: [], snapshotDate: null, snapshotTotal: null };
  }
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    // dashboard/ is the Next.js root; vault/ is a sibling.
    const dir = path.join(process.cwd(), '..', 'vault', 'nsdl', 'parsed_json');
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      return { holdings: [], snapshotDate: null, snapshotTotal: null };
    }
    const jsonFiles = files
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();
    if (jsonFiles.length === 0) {
      return { holdings: [], snapshotDate: null, snapshotTotal: null };
    }
    const latest = jsonFiles[0];
    const text = await fs.readFile(path.join(dir, latest), 'utf-8');
    const parsed = JSON.parse(text);

    // parse.py output shape: { statement_date, total_value, holdings: [...] }
    // Holdings entries: { asset_name, asset_type, value } (post-aggregation)
    const holdings: NsdlHolding[] = Array.isArray(parsed.holdings)
      ? parsed.holdings
          .filter((h: { value?: number; asset_name?: string }) => h && h.asset_name && typeof h.value === 'number')
          .map((h: { asset_name: string; asset_type?: string; value: number }) => ({
            name: h.asset_name,
            type: (h.asset_type || 'other') as NsdlHoldingType,
            value: h.value,
          }))
      : [];

    holdings.sort((a, b) => b.value - a.value);

    return {
      holdings,
      snapshotDate: parsed.statement_date || null,
      snapshotTotal: typeof parsed.total_value === 'number' ? parsed.total_value : null,
    };
  } catch (e) {
    console.warn('loadLatestHoldings:', e);
    return { holdings: [], snapshotDate: null, snapshotTotal: null };
  }
}

// ─── Public entry ──────────────────────────────────────────────────────────────
export async function getNsdlData(forceRefresh = false): Promise<NsdlData> {
  if (!forceRefresh) {
    const cached = getCache<NsdlData>('nsdl-data');
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
  setCache('nsdl-data', data, CACHE_TTL);
  return data;
}
