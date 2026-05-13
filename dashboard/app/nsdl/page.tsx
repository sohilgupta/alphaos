'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, LineChart, Line, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/providers/AuthProvider';
import type { NsdlData, NsdlHolding } from '@/lib/nsdl';
import type { MergedStock } from '@/lib/types';

// ─── Helpers ───────────────────────────────────────────────────────────────────
const INR_CR = 1e7;
function formatCr(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e9) return `₹${(n / 1e9).toFixed(2)} K Cr`;
  if (Math.abs(n) >= INR_CR) return `₹${(n / INR_CR).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} Lacs`;
  return `₹${n.toLocaleString('en-IN')}`;
}
function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
function formatYearsAway(y: number | null): string {
  if (y == null) return '—';
  if (y === 0) return '✓ reached';
  if (y < 1) return `${Math.round(y * 12)} mo`;
  return `${y.toFixed(1)} yr`;
}

// Fuzzy match: strip company suffixes, lowercase, return tokens
function normaliseName(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/limited|ltd\.?|pvt|private|company|corp\.?|inc\.?|co\.?/g, '')
    .replace(/[.,&\-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3);
}

function reconcileEquities(
  holdings: NsdlHolding[],
  portfolio: MergedStock[],
): { matched: { holding: NsdlHolding; stock: MergedStock }[]; onlyInNsdl: NsdlHolding[]; onlyInPortfolio: MergedStock[] } {
  const equityHoldings = holdings.filter(h => h.type === 'equity');
  const indianPort = portfolio.filter(s => s.region === 'INDIA' && s.isInPortfolio);

  const matched: { holding: NsdlHolding; stock: MergedStock }[] = [];
  const usedStocks = new Set<string>();
  const unmatchedHoldings: NsdlHolding[] = [];

  for (const h of equityHoldings) {
    const tokens = normaliseName(h.name);
    if (tokens.length === 0) { unmatchedHoldings.push(h); continue; }
    const head = tokens[0];
    const match = indianPort.find(s => {
      if (usedStocks.has(s.ticker)) return false;
      const stockTokens = normaliseName(s.name);
      // Match if first 4+ chars of head appear in any stock token, OR ticker contains head
      const ticker = s.ticker.toLowerCase().replace(/\.(ns|bo)$/, '');
      if (ticker.includes(head.slice(0, 5)) || head.includes(ticker.slice(0, 5))) return true;
      return stockTokens.some(t => t.startsWith(head.slice(0, 5)) || head.startsWith(t.slice(0, 5)));
    });
    if (match) {
      matched.push({ holding: h, stock: match });
      usedStocks.add(match.ticker);
    } else {
      unmatchedHoldings.push(h);
    }
  }

  const onlyInPortfolio = indianPort.filter(s => !usedStocks.has(s.ticker));
  return { matched, onlyInNsdl: unmatchedHoldings, onlyInPortfolio };
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card className="bg-gradient-to-br from-zinc-950/80 to-zinc-900/40 border-white/8">
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-800 tabular-nums ${accent || 'text-foreground'}`}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function MilestoneTile({ label, amount, yearsAway, currentValue }: { label: string; amount: number; yearsAway: number | null; currentValue: number }) {
  const reached = currentValue >= amount;
  const progress = Math.min(100, (currentValue / amount) * 100);
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-700">{label}</div>
        <Badge variant="secondary" className={`text-[10px] ${reached ? 'bg-emerald-500/15 text-emerald-400' : ''}`}>
          {formatYearsAway(yearsAway)}
        </Badge>
      </div>
      <div className="mt-2 w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${reached ? 'bg-emerald-400' : 'bg-primary/60'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">{progress.toFixed(1)}%</div>
    </div>
  );
}

function HoldingsTable({ holdings, type, total }: { holdings: NsdlHolding[]; type: string; total: number | null }) {
  const filtered = holdings.filter(h => h.type === type);
  if (!filtered.length) return null;
  const sum = filtered.reduce((s, h) => s + h.value, 0);
  return (
    <Card className="bg-zinc-950/60 border-white/8">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-700 flex items-center justify-between">
          <span>{type === 'equity' ? 'Equities' : type === 'mutual_fund' ? 'Mutual Funds' : type}</span>
          <Badge variant="secondary" className="text-[10px]">
            {filtered.length} · {formatCr(sum)} {total ? `(${((sum / total) * 100).toFixed(0)}%)` : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-white/5">
              {filtered.map((h, i) => (
                <tr key={`${h.name}-${i}`} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-foreground/90 truncate max-w-[280px]">{h.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-600">{formatCr(h.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function NsdlPage() {
  const router = useRouter();
  const { role, isLoading: authLoading } = useAuth();
  const [historyRange, setHistoryRange] = useState<'ALL' | '5Y' | '3Y' | '1Y'>('ALL');
  const [cagrOverride, setCagrOverride] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && role !== 'owner') router.replace('/login?next=/nsdl');
  }, [role, authLoading, router]);

  const { data: nsdl, isLoading: nsdlLoading } = useQuery<NsdlData>({
    queryKey: ['nsdl'],
    queryFn: async () => {
      const res = await fetch('/api/nsdl');
      if (!res.ok) throw new Error('Failed to load NSDL data');
      return res.json();
    },
    enabled: role === 'owner',
    staleTime: 30 * 60 * 1000,
  });

  const { data: stocksData } = useQuery<{ stocks: MergedStock[] }>({
    queryKey: ['stocks-for-nsdl'],
    queryFn: async () => {
      const res = await fetch('/api/stocks');
      if (!res.ok) throw new Error('Failed to load stocks');
      return res.json();
    },
    enabled: role === 'owner',
    staleTime: 5 * 60 * 1000,
  });

  // Filter history by range
  const filteredHistory = useMemo(() => {
    if (!nsdl?.history) return [];
    if (historyRange === 'ALL') return nsdl.history;
    const monthsBack = historyRange === '5Y' ? 60 : historyRange === '3Y' ? 36 : 12;
    return nsdl.history.slice(-monthsBack);
  }, [nsdl, historyRange]);

  // Projection with optional CAGR override
  const projection = useMemo(() => {
    if (!nsdl?.summary) return [];
    const cagr = (cagrOverride ?? nsdl.summary.cagrPct) / 100;
    const cur = nsdl.summary.currentValue;
    const nowYear = new Date().getFullYear();
    return Array.from({ length: 25 }, (_, i) => ({
      yearOffset: i,
      yearLabel: String(nowYear + i),
      value: cur * Math.pow(1 + cagr, i),
    }));
  }, [nsdl, cagrOverride]);

  // Reconcile latest holdings vs Indian portfolio
  const recon = useMemo(() => {
    if (!nsdl?.latestHoldings?.length || !stocksData?.stocks?.length) return null;
    return reconcileEquities(nsdl.latestHoldings, stocksData.stocks);
  }, [nsdl, stocksData]);

  if (authLoading || role !== 'owner') {
    return <div className="p-6 text-sm text-muted-foreground">Redirecting…</div>;
  }

  if (nsdlLoading || !nsdl) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 skeleton" />)}
        </div>
        <Skeleton className="h-80 skeleton" />
      </div>
    );
  }

  const s = nsdl.summary;
  const months = s.monthsTracked;
  const yearsTracked = months / 12;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-800 text-foreground">NSDL CAS — Net Worth</h1>
          <p className="text-xs text-muted-foreground">
            {s.startDate} → {nsdl.history[nsdl.history.length - 1]?.date} · {months} monthly snapshots · {yearsTracked.toFixed(1)} years tracked
          </p>
        </div>
        {nsdl.latestSnapshotDate && (
          <Badge variant="secondary" className="text-xs">
            Latest statement: {nsdl.latestSnapshotDate} · {formatCr(nsdl.latestSnapshotTotal || 0)}
          </Badge>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Current Value"
          value={formatCr(s.currentValue)}
          sub={`Peak ${formatCr(s.peakValue)} on ${s.peakDate}`}
        />
        <KpiCard
          label="CAGR"
          value={formatPct(s.cagrPct)}
          sub={`Total return ${formatPct(s.totalReturnPct)}`}
          accent={s.cagrPct >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <KpiCard
          label="Starting Value"
          value={formatCr(s.startValue)}
          sub={`On ${s.startDate}`}
        />
        <KpiCard
          label="Multiple"
          value={`${(s.currentValue / s.startValue).toFixed(2)}x`}
          sub={`Over ${yearsTracked.toFixed(1)} years`}
        />
      </div>

      {/* Milestones */}
      <div>
        <h2 className="text-sm font-700 text-muted-foreground uppercase tracking-wider mb-3">Milestones (at realised {s.cagrPct.toFixed(1)}% CAGR)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {s.milestones.map(m => (
            <MilestoneTile key={m.label} {...m} currentValue={s.currentValue} />
          ))}
        </div>
      </div>

      {/* History chart */}
      <Card className="bg-zinc-950/60 border-white/8">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-700">Net Worth History</CardTitle>
          <div className="flex gap-1">
            {(['1Y', '3Y', '5Y', 'ALL'] as const).map(r => (
              <button
                key={r}
                onClick={() => setHistoryRange(r)}
                className={`px-2 py-1 text-xs rounded-md font-600 transition-colors ${
                  historyRange === r ? 'bg-primary/15 text-primary' : 'bg-white/[0.03] text-muted-foreground hover:text-foreground'
                }`}
              >{r}</button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="w-full h-80">
            <ResponsiveContainer>
              <AreaChart data={filteredHistory}>
                <defs>
                  <linearGradient id="nv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.75 0.15 200)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="oklch(0.75 0.15 200)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.005 264)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'oklch(0.55 0.005 264)' }} minTickGap={40} />
                <YAxis
                  tick={{ fontSize: 11, fill: 'oklch(0.55 0.005 264)' }}
                  tickFormatter={v => `${(v / INR_CR).toFixed(1)}Cr`}
                  width={60}
                />
                <Tooltip
                  contentStyle={{ background: 'oklch(0.10 0.006 264)', border: '1px solid oklch(0.25 0.005 264)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: unknown) => [formatCr(Number(value)), 'Value']}
                />
                <Area type="monotone" dataKey="value" stroke="oklch(0.75 0.15 200)" strokeWidth={2} fill="url(#nv)" />
                <ReferenceLine y={s.startValue} stroke="oklch(0.4 0.01 264)" strokeDasharray="4 4" label={{ value: 'Start', fontSize: 10, fill: 'oklch(0.5 0.005 264)' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Projection chart */}
      <Card className="bg-zinc-950/60 border-white/8">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-700">25-Year Projection</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">CAGR</span>
            <input
              type="range"
              min="0"
              max="30"
              step="0.5"
              value={cagrOverride ?? s.cagrPct}
              onChange={e => setCagrOverride(parseFloat(e.target.value))}
              className="w-32 accent-primary"
            />
            <span className="font-700 tabular-nums text-primary w-12 text-right">{(cagrOverride ?? s.cagrPct).toFixed(1)}%</span>
            {cagrOverride !== null && (
              <button onClick={() => setCagrOverride(null)} className="text-muted-foreground hover:text-foreground">↺</button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="w-full h-72">
            <ResponsiveContainer>
              <LineChart data={projection}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.005 264)" />
                <XAxis dataKey="yearLabel" tick={{ fontSize: 11, fill: 'oklch(0.55 0.005 264)' }} />
                <YAxis tickFormatter={v => `${(v / INR_CR).toFixed(0)}Cr`} tick={{ fontSize: 11, fill: 'oklch(0.55 0.005 264)' }} width={60} />
                <Tooltip
                  contentStyle={{ background: 'oklch(0.10 0.006 264)', border: '1px solid oklch(0.25 0.005 264)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: unknown) => [formatCr(Number(value)), 'Projected']}
                />
                <Line type="monotone" dataKey="value" stroke="oklch(0.75 0.15 140)" strokeWidth={2} dot={false} />
                <ReferenceLine y={1e7} stroke="oklch(0.5 0.1 60)" strokeDasharray="3 3" label={{ value: '₹1 Cr', fontSize: 10, fill: 'oklch(0.7 0.1 60)' }} />
                <ReferenceLine y={1e8} stroke="oklch(0.5 0.1 60)" strokeDasharray="3 3" label={{ value: '₹10 Cr', fontSize: 10, fill: 'oklch(0.7 0.1 60)' }} />
                <ReferenceLine y={1e9} stroke="oklch(0.5 0.1 60)" strokeDasharray="3 3" label={{ value: '₹100 Cr', fontSize: 10, fill: 'oklch(0.7 0.1 60)' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Latest holdings */}
      {nsdl.latestHoldings.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <HoldingsTable holdings={nsdl.latestHoldings} type="equity" total={nsdl.latestSnapshotTotal} />
          <HoldingsTable holdings={nsdl.latestHoldings} type="mutual_fund" total={nsdl.latestSnapshotTotal} />
        </div>
      )}

      {/* Reconciliation */}
      {recon && (
        <Card className="bg-zinc-950/60 border-white/8">
          <CardHeader>
            <CardTitle className="text-sm font-700">Reconciliation — Latest CAS vs alphaos Indian Portfolio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="text-xs text-emerald-400 font-700">✅ In both</div>
                <div className="text-xl font-800 mt-1">{recon.matched.length}</div>
                <div className="text-[10px] text-muted-foreground">tracked correctly</div>
              </div>
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
                <div className="text-xs text-yellow-400 font-700">🟡 In NSDL only</div>
                <div className="text-xl font-800 mt-1">{recon.onlyInNsdl.length}</div>
                <div className="text-[10px] text-muted-foreground">missing from your alphaos portfolio</div>
              </div>
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <div className="text-xs text-red-400 font-700">🔴 In alphaos only</div>
                <div className="text-xl font-800 mt-1">{recon.onlyInPortfolio.length}</div>
                <div className="text-[10px] text-muted-foreground">not in latest CAS — sold? BSE? other DP?</div>
              </div>
            </div>

            {recon.onlyInNsdl.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-600 text-muted-foreground mb-1">In NSDL but missing from alphaos:</div>
                <div className="flex flex-wrap gap-1.5">
                  {recon.onlyInNsdl.map(h => (
                    <span key={h.name} className="text-xs bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 rounded px-2 py-0.5">
                      {h.name} <span className="text-yellow-300/60">· {formatCr(h.value)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {recon.onlyInPortfolio.length > 0 && (
              <div>
                <div className="text-xs font-600 text-muted-foreground mb-1">In alphaos but not in latest CAS:</div>
                <div className="flex flex-wrap gap-1.5">
                  {recon.onlyInPortfolio.map(s => (
                    <span key={s.ticker} className="text-xs bg-red-500/10 text-red-300 border border-red-500/20 rounded px-2 py-0.5">
                      {s.ticker} · {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty-state for holdings if running on Vercel without SQLite */}
      {nsdl.latestHoldings.length === 0 && (
        <Card className="bg-zinc-950/60 border-dashed border-white/10">
          <CardContent className="p-6 text-center">
            <div className="text-sm font-700">No latest holdings data available</div>
            <div className="text-xs text-muted-foreground mt-1 max-w-lg mx-auto">
              Holdings reconciliation requires <code className="text-[11px] bg-white/5 px-1 rounded">vault/nsdl/parsed_json/</code> to be present on the server.
              Run <code className="text-[11px] bg-white/5 px-1 rounded">python nsdl_cas/scripts/ingest_latest.py --only-latest</code> locally,
              then refresh this page.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
