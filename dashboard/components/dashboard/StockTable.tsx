'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, LayoutGrid, List, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPercent, formatStockPrice, formatTicker, getChangeBg, getChangeColor, getReturnHeatClass, displayName, type HeatTf } from '@/lib/format';
import { MergedStock, Verdict, Confidence } from '@/lib/types';
import { useAuth } from '@/components/providers/AuthProvider';

// ─── Types ─────────────────────────────────────────────────────────────────────
type Timeframe = '1D' | '1W' | '1M' | '3M' | '1Y' | '3Y';
type ColSortKey = 'ticker' | 'name' | 'price' | 'marketCap' | 'pe' | 'upside';
type SortKey = Timeframe | ColSortKey;
type SortDir = 'asc' | 'desc';
type QF =
  | { kind: 'timeframe'; dir: 'top' | 'bottom'; tf: Timeframe }
  | { kind: 'verdict'; verdict: Verdict }
  | { kind: 'confidence' }
  | { kind: 'upside' }
  | { kind: 'weakening' }
  | { kind: 'overvalued' }
  | null;

interface Props { stocks: MergedStock[]; isLoading: boolean; }

// ─── Constants ─────────────────────────────────────────────────────────────────
const TFS: { label: Timeframe; get: (s: MergedStock) => number | null }[] = [
  { label: '1D', get: s => s.live?.changePercent ?? null },
  { label: '1W', get: s => s.gain1W },
  { label: '1M', get: s => s.gain1M },
  { label: '3M', get: s => s.gain6M },
  { label: '1Y', get: s => s.gain1Y },
  { label: '3Y', get: s => s.gain3Y },
];

const VC: Record<Verdict, { bg: string; text: string; border: string }> = {
  'Strong Buy': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'Buy':        { bg: 'bg-teal-500/15',    text: 'text-teal-400',    border: 'border-teal-500/30'    },
  'Watch':      { bg: 'bg-yellow-500/15',  text: 'text-yellow-400',  border: 'border-yellow-500/30'  },
  'Hold':       { bg: 'bg-zinc-500/15',    text: 'text-zinc-400',    border: 'border-zinc-500/30'    },
  'Reduce':     { bg: 'bg-orange-500/15',  text: 'text-orange-400',  border: 'border-orange-500/30'  },
  'Avoid':      { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30'     },
};

// ─── Helpers ────────────────────────────────────────────────────────────────────
function tfVal(s: MergedStock, tf: Timeframe): number {
  return TFS.find(t => t.label === tf)?.get(s) ?? -Infinity;
}

function qfMatch(active: QF, target: QF): boolean {
  if (!active || !target) return false;
  if (active.kind !== target.kind) return false;
  if (active.kind === 'timeframe' && target.kind === 'timeframe') return active.dir === target.dir && active.tf === target.tf;
  if (active.kind === 'verdict' && target.kind === 'verdict') return active.verdict === target.verdict;
  return true;
}

// ─── Sub-components ─────────────────────────────────────────────────────────────
function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return null;
  const c = VC[verdict];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-700 border whitespace-nowrap ${c.bg} ${c.text} ${c.border}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {verdict}
    </span>
  );
}

function ConfidenceMeter({ confidence }: { confidence: Confidence | null }) {
  if (!confidence) return null;
  const w = confidence === 'High' ? 'w-full' : confidence === 'Medium' ? 'w-2/3' : 'w-1/3';
  const col = confidence === 'High' ? 'bg-emerald-400' : confidence === 'Medium' ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 rounded-full bg-foreground/10 overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${w} ${col}`} />
      </div>
      <span className="text-[10px] text-muted-foreground">{confidence}</span>
    </div>
  );
}

function FairValueCell({ stock }: { stock: MergedStock }) {
  if (!stock.fairPrice && stock.potentialGain == null) return <span className="text-muted-foreground/40 text-xs">—</span>;
  const up = (stock.potentialGain ?? 0) >= 0;
  return (
    <div className="text-xs">
      {stock.fairPrice && <div className="font-600 text-foreground/70 tabular-nums">{formatStockPrice(stock.fairPrice, stock.region)}</div>}
      {stock.potentialGain != null && (
        <div className={`font-700 tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {up ? '+' : ''}{stock.potentialGain.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function ReturnChip({ label, value, active, onClick, tf }: {
  label: string; value: number | null; active?: boolean; onClick?: () => void; tf: HeatTf;
}) {
  const heat = getReturnHeatClass(value, tf);
  const onSolidTile = heat === 'heat-up-3' || heat === 'heat-up-4' || heat === 'heat-dn-3' || heat === 'heat-dn-4';
  // Active state uses a 2px foreground-tinted inset border instead of a
  // `ring` so the chip's outer dimensions stay identical to its inactive
  // sibling (rings sit OUTSIDE the box). `border-foreground/60` reads as
  // dark on light tiles and light on solid green/red tiles — no clash
  // with the amber primary.
  return (
    <button type="button" onClick={onClick}
      className={`${heat} shrink-0 min-w-[3.25rem] rounded-md border-2 px-2 py-1.5 text-center transition-all
        ${active ? (onSolidTile ? 'border-white/80' : 'border-foreground/60') : 'border-transparent hover:brightness-110'}
        ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className={`text-[10px] font-700 uppercase tracking-wide ${onSolidTile ? 'text-white/95' : 'opacity-80'}`}>
        {label}
      </div>
      <div className="mt-0.5 text-xs font-700 tabular-nums">{formatPercent(value, 1)}</div>
    </button>
  );
}

function ReturnStrip({ stock, active, onSort }: { stock: MergedStock; active: SortKey; onSort: (tf: Timeframe) => void }) {
  return (
    <div className="overflow-x-auto scrollbar-none">
      <div className="flex gap-1 min-w-max">
        {TFS.map(({ label, get }) => (
          <ReturnChip key={label} label={label} value={get(stock)} active={active === label} onClick={() => onSort(label)} tf={label as HeatTf} />
        ))}
      </div>
    </div>
  );
}

// ─── Mobile Card ────────────────────────────────────────────────────────────────
function MobileCard({ stock, isOwner, active, onSort, onOpen }: {
  stock: MergedStock; isOwner: boolean; active: SortKey; onSort: (tf: Timeframe) => void; onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const price = stock.live?.price ?? stock.currentPriceSheet ?? null;
  const change = stock.live?.changePercent ?? null;
  const hasIntel = !!(stock.verdict || stock.confidence || stock.fairPrice || (isOwner && stock.portfolioData));

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <button type="button" onClick={onOpen} className="w-full text-left p-4 active:opacity-80">
        {/* Row 1: Name + Verdict */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-700 text-foreground truncate">{displayName({ sheetName: stock.name, liveShortName: stock.live?.shortName, liveLongName: stock.live?.longName, ticker: stock.ticker })}</p>
            <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-600 text-muted-foreground">{formatTicker(stock.ticker)}</span>
              <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[10px]">
                {stock.region === 'INDIA' ? 'IN' : 'US'}
              </Badge>
              {stock.category && <span className="text-[10px] text-muted-foreground/60 truncate">{stock.category}</span>}
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <VerdictBadge verdict={stock.verdict} />
            <ConfidenceMeter confidence={stock.confidence} />
          </div>
        </div>

        {/* Row 2: Price + Fair Value */}
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-xl font-800 tabular-nums text-foreground">{formatStockPrice(price, stock.region)}</p>
            <p className={`text-sm font-600 tabular-nums ${getChangeColor(change)}`}>{formatPercent(change)} today</p>
          </div>
          {(stock.fairPrice || stock.potentialGain != null) && (
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground/60 mb-0.5">Fair Value</p>
              <FairValueCell stock={stock} />
            </div>
          )}
        </div>
      </button>

      {/* Returns strip */}
      <div className="px-4 pb-3">
        <ReturnStrip stock={stock} active={active} onSort={onSort} />
      </div>

      {/* Intelligence panel toggle */}
      {hasIntel && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-center gap-1 py-2 border-t border-border text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Less' : 'Intelligence'}
          </button>
          {expanded && (
            <div className="px-4 pb-4 pt-2 border-t border-border bg-foreground/[0.02] space-y-2.5">
              {stock.verdict && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Signal</span>
                  <VerdictBadge verdict={stock.verdict} />
                </div>
              )}
              {stock.confidence && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Confidence</span>
                  <ConfidenceMeter confidence={stock.confidence} />
                </div>
              )}
              {stock.fairPrice && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Fair Price</span>
                  <span className="text-xs font-600 tabular-nums">{formatStockPrice(stock.fairPrice, stock.region)}</span>
                </div>
              )}
              {stock.potentialGain != null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Upside</span>
                  <span className={`text-xs font-700 tabular-nums ${stock.potentialGain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {stock.potentialGain >= 0 ? '+' : ''}{stock.potentialGain.toFixed(1)}%
                  </span>
                </div>
              )}
              {isOwner && stock.portfolioData && stock.live?.price && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">P&L</span>
                  {(() => {
                    const pd = stock.portfolioData!;
                    const pl = (stock.live!.price - pd.avgBuyPrice) * pd.quantity;
                    const pct = ((stock.live!.price - pd.avgBuyPrice) / pd.avgBuyPrice) * 100;
                    return (
                      <span className={`text-xs font-700 tabular-nums ${getChangeColor(pl)}`}>
                        {formatStockPrice(pl, stock.region)} ({formatPercent(pct)})
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────
export default function StockTable({ stocks, isLoading }: Props) {
  const router = useRouter();
  const { role } = useAuth();
  const isOwner = role === 'owner';

  const [sortKey, setSortKey] = useState<SortKey>('1D');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [quickFilter, setQuickFilter] = useState<QF>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = useMemo(() => {
    const q = search.toLowerCase().trim();
    const searched = !q
      ? stocks
      : stocks.filter(s => {
          // Search across every meaningful name field. Yahoo's shortName /
          // longName often catches stocks whose sheet entry is a code (e.g.
          // searching "vak" finds 531489 because Yahoo has "CG-VAK Software").
          const haystack = [
            s.ticker,
            s.name,
            s.category,
            s.live?.shortName,
            s.live?.longName,
          ]
            .filter(Boolean)
            .map(v => String(v).toLowerCase());
          return haystack.some(v => v.includes(q));
        });

    if (quickFilter) {
      if (quickFilter.kind === 'timeframe') {
        return [...searched]
          .sort((a, b) => {
            const diff = tfVal(b, quickFilter.tf) - tfVal(a, quickFilter.tf);
            return quickFilter.dir === 'top' ? diff : -diff;
          })
          .slice(0, 10);
      }
      if (quickFilter.kind === 'verdict') {
        return searched.filter(s => s.verdict === quickFilter.verdict);
      }
      if (quickFilter.kind === 'confidence') {
        return searched.filter(s => s.confidence === 'High')
          .sort((a, b) => (b.potentialGain ?? -Infinity) - (a.potentialGain ?? -Infinity));
      }
      if (quickFilter.kind === 'upside') {
        return [...searched].filter(s => s.potentialGain != null)
          .sort((a, b) => (b.potentialGain ?? -Infinity) - (a.potentialGain ?? -Infinity))
          .slice(0, 20);
      }
      if (quickFilter.kind === 'weakening') {
        return searched.filter(s => (s.gain1M ?? 0) < 0 && (s.gain1Y ?? 0) > 0)
          .sort((a, b) => (a.gain1M ?? 0) - (b.gain1M ?? 0));
      }
      if (quickFilter.kind === 'overvalued') {
        return searched.filter(s => (s.potentialGain ?? 0) < -5)
          .sort((a, b) => (a.potentialGain ?? 0) - (b.potentialGain ?? 0));
      }
    }

    return [...searched].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      const isTimeframe = ['1D', '1W', '1M', '3M', '1Y', '3Y'].includes(sortKey);

      if (isTimeframe) {
        aVal = tfVal(a, sortKey as Timeframe);
        bVal = tfVal(b, sortKey as Timeframe);
      } else {
        switch (sortKey as ColSortKey) {
          case 'ticker':    aVal = a.ticker; bVal = b.ticker; break;
          case 'name':      aVal = a.name;   bVal = b.name;   break;
          case 'price':     aVal = a.live?.price ?? -Infinity; bVal = b.live?.price ?? -Infinity; break;
          case 'marketCap': aVal = a.live?.marketCap ?? a.marketCapSheet ?? -Infinity; bVal = b.live?.marketCap ?? b.marketCapSheet ?? -Infinity; break;
          case 'pe':        aVal = a.live?.pe ?? -Infinity;    bVal = b.live?.pe ?? -Infinity;    break;
          case 'upside':    aVal = a.potentialGain ?? -Infinity; bVal = b.potentialGain ?? -Infinity; break;
          default:          aVal = 0; bVal = 0;
        }
      }

      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [stocks, sortKey, sortDir, search, quickFilter]);

  const sortIcon = (k: SortKey) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'desc' ? <ArrowDown className="w-3 h-3 text-primary" /> : <ArrowUp className="w-3 h-3 text-primary" />;
  };

  const colHead = (k: ColSortKey, label: string, cls = '') => (
    <th onClick={() => handleSort(k)}
      className={`px-3 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors ${cls}`}
    >
      <div className="flex items-center gap-1.5">{label} {sortIcon(k)}</div>
    </th>
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-9 flex-1 skeleton" />
          <Skeleton className="hidden h-9 w-20 skeleton md:block" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl md:h-12 skeleton" />
        ))}
      </div>
    );
  }

  const SIGNAL_FILTERS: { label: string; qf: QF }[] = [
    { label: '🎯 Strong Buy',      qf: { kind: 'verdict', verdict: 'Strong Buy' } },
    { label: '📈 Highest Upside',  qf: { kind: 'upside' } },
    { label: '💎 High Confidence', qf: { kind: 'confidence' } },
    { label: '📉 Weakening',       qf: { kind: 'weakening' } },
    { label: '🔴 Overvalued',      qf: { kind: 'overvalued' } },
  ];

  return (
    <div className="space-y-3 max-w-full overflow-hidden">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="stock-search"
            placeholder="Search ticker, name, category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-foreground/8 text-sm focus-visible:ring-primary/40"
          />
        </div>

        {/* Timeframe sort bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <span className="shrink-0 text-xs text-muted-foreground/60 pr-1">Sort:</span>
          {TFS.map(({ label }) => {
            const active = sortKey === label;
            return (
              <button key={label} onClick={() => handleSort(label)}
                className={`shrink-0 flex items-center gap-0.5 px-2.5 py-1.5 rounded-md text-xs font-600 border transition-colors
                  ${active ? 'bg-primary/15 text-primary border-primary/30' : 'bg-secondary/40 text-muted-foreground border-foreground/8 hover:text-foreground hover:bg-secondary/60'}`}
              >
                {label}
                {active && (sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
              </button>
            );
          })}
        </div>

        <div className="hidden items-center gap-1 p-1 rounded-lg bg-secondary/50 border border-foreground/8 md:flex">
          <button onClick={() => setView('table')}
            className={`p-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          ><List className="w-4 h-4" /></button>
          <button onClick={() => setView('grid')}
            className={`p-1.5 rounded-md transition-colors ${view === 'grid' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          ><LayoutGrid className="w-4 h-4" /></button>
        </div>

        <span className="text-xs text-muted-foreground">{sorted.length} stocks</span>
      </div>

      {/* Quick filter bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
        {SIGNAL_FILTERS.map(({ label, qf }) => {
          const isActive = qfMatch(quickFilter, qf);
          return (
            <button key={label} onClick={() => setQuickFilter(isActive ? null : qf)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-600 border transition-all
                ${isActive ? 'bg-primary/20 text-primary border-primary/40' : 'bg-foreground/5 text-muted-foreground border-foreground/10 hover:border-foreground/20 hover:text-foreground'}`}
            >{label}</button>
          );
        })}

        <div className="w-px h-4 bg-foreground/10 mx-1 shrink-0" />
        <span className="shrink-0 text-xs text-muted-foreground/50">Best:</span>

        {TFS.map(({ label }) => {
          const topAct = quickFilter?.kind === 'timeframe' && quickFilter.dir === 'top'    && quickFilter.tf === label;
          const botAct = quickFilter?.kind === 'timeframe' && quickFilter.dir === 'bottom' && quickFilter.tf === label;
          return (
            <div key={label} className="flex shrink-0 rounded-md overflow-hidden border border-foreground/8">
              <button onClick={() => setQuickFilter(topAct ? null : { kind: 'timeframe', dir: 'top',    tf: label })}
                className={`px-2 py-1 text-xs font-600 transition-colors ${topAct ? 'bg-emerald-500/20 text-emerald-400' : 'bg-secondary/40 text-muted-foreground hover:text-emerald-400'}`}
              >↑{label}</button>
              <div className="w-px bg-foreground/8" />
              <button onClick={() => setQuickFilter(botAct ? null : { kind: 'timeframe', dir: 'bottom', tf: label })}
                className={`px-2 py-1 text-xs font-600 transition-colors ${botAct ? 'bg-red-500/20 text-red-400' : 'bg-secondary/40 text-muted-foreground hover:text-red-400'}`}
              >↓{label}</button>
            </div>
          );
        })}

        {quickFilter && (
          <button onClick={() => setQuickFilter(null)}
            className="shrink-0 px-2 py-1 rounded-full text-xs font-600 text-muted-foreground border border-foreground/8 bg-secondary/40 hover:text-foreground transition-colors"
          >✕ Reset</button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-foreground/[0.02] py-12 px-6 text-center">
          <div className="text-sm font-600 text-foreground mb-1">No stocks match this filter</div>
          <div className="text-xs text-muted-foreground max-w-md mx-auto">
            {quickFilter?.kind === 'verdict' && `No stocks tagged "${quickFilter.verdict}" in the current sheet. Add a Verdict column to the Google Sheet to populate this.`}
            {quickFilter?.kind === 'confidence' && 'No stocks tagged High Confidence. Add a Confidence column to the Google Sheet to populate this.'}
            {quickFilter?.kind === 'upside' && 'No stocks have a Fair Price / Potential Gain set in the sheet.'}
            {quickFilter?.kind === 'overvalued' && 'No stocks are currently flagged as overvalued (potential gain < -5%).'}
            {quickFilter?.kind === 'weakening' && 'No stocks are weakening short-term while positive on 1Y.'}
            {(!quickFilter || quickFilter.kind === 'timeframe') && 'Try clearing the search or filter.'}
          </div>
          {quickFilter && (
            <button onClick={() => setQuickFilter(null)}
              className="mt-4 px-3 py-1.5 rounded-md text-xs font-600 border border-foreground/10 bg-foreground/5 text-foreground hover:bg-foreground/10 transition-colors"
            >Clear filter</button>
          )}
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {sorted.map(stock => (
            <div key={stock.ticker} onClick={() => router.push(`/stock/${stock.ticker}`)}
              className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-all hover:shadow-lg hover:shadow-primary/5 group space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-700 text-foreground group-hover:text-primary transition-colors">{formatTicker(stock.ticker)}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[100px]">{displayName({ sheetName: stock.name, liveShortName: stock.live?.shortName, liveLongName: stock.live?.longName, ticker: stock.ticker })}</div>
                </div>
                {stock.verdict && <VerdictBadge verdict={stock.verdict} />}
              </div>
              <div>
                <div className="text-lg font-700 tabular-nums">
                  {stock.live?.price ? formatStockPrice(stock.live.price, stock.region) : formatStockPrice(stock.currentPriceSheet, stock.region)}
                </div>
                {stock.live?.changePercent != null && (
                  <Badge className={`mt-1 text-xs font-600 ${getChangeBg(stock.live.changePercent)}`} variant="secondary">
                    {formatPercent(stock.live.changePercent)}
                  </Badge>
                )}
              </div>
              {(stock.fairPrice || stock.potentialGain != null) && (
                <div className="flex items-center justify-between text-xs border-t border-border pt-2">
                  <span className="text-muted-foreground/60">Fair</span>
                  <FairValueCell stock={stock} />
                </div>
              )}
              <ConfidenceMeter confidence={stock.confidence} />
              <div className="pt-2 border-t border-foreground/8">
                <ReturnStrip stock={stock} active={sortKey} onSort={handleSort} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {sorted.map(stock => (
              <MobileCard key={stock.ticker} stock={stock} isOwner={isOwner} active={sortKey}
                onSort={handleSort} onOpen={() => router.push(`/stock/${stock.ticker}`)} />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-foreground/8 overflow-hidden">
            <div className="overflow-x-auto w-full scrollbar-thin">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider">Tag</th>
                    {colHead('ticker', 'Ticker')}
                    {colHead('name', 'Company')}
                    <th className="px-3 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider">Signal</th>
                    <th onClick={() => handleSort('price')}
                      className="px-3 py-3 text-right text-xs font-600 text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                    >
                      <div className="flex items-center justify-end gap-1.5">Price {sortIcon('price')}</div>
                    </th>
                    <th onClick={() => handleSort('upside')}
                      className="px-3 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                    >
                      <div className="flex items-center gap-1.5">Fair Value {sortIcon('upside')}</div>
                    </th>
                    {/* Returns with per-timeframe sort */}
                    <th className="px-3 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider">
                      <div className="flex items-center gap-1.5">
                        {TFS.map(({ label }) => {
                          const active = sortKey === label;
                          return (
                            <button key={label} onClick={() => handleSort(label)}
                              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-700 uppercase tracking-wider border transition-colors
                                ${active ? 'bg-primary/15 text-primary border-primary/30' : 'text-muted-foreground border-foreground/8 hover:text-foreground hover:border-foreground/20'}`}
                            >
                              {label}
                              {active && (sortDir === 'desc' ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronUp className="w-2.5 h-2.5" />)}
                            </button>
                          );
                        })}
                      </div>
                    </th>
                    {isOwner && <th className="px-3 py-3 text-right text-xs font-600 text-muted-foreground uppercase tracking-wider">Qty</th>}
                    {isOwner && <th className="px-3 py-3 text-right text-xs font-600 text-muted-foreground uppercase tracking-wider">Avg</th>}
                    {isOwner && <th className="px-3 py-3 text-right text-xs font-600 text-muted-foreground uppercase tracking-wider">P&L</th>}
                    <th className="px-3 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider">Theme</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sorted.map(stock => {
                    const price = stock.live?.price;
                    return (
                      <tr key={stock.ticker} onClick={() => router.push(`/stock/${stock.ticker}`)} className="ticker-row group">
                        <td className="px-3 py-2.5">
                          {isOwner && stock.isInWatchlist && stock.isInPortfolio && <Badge variant="secondary" className="text-[10px]">Both</Badge>}
                          {stock.isInWatchlist && !stock.isInPortfolio && <Badge variant="secondary" className="text-[10px]">Watch</Badge>}
                          {isOwner && !stock.isInWatchlist && stock.isInPortfolio && <Badge variant="secondary" className="text-[10px]">Port</Badge>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-700 text-foreground group-hover:text-primary transition-colors">{formatTicker(stock.ticker)}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="max-w-[160px]">
                            <div className="text-foreground/90 font-500 truncate">{displayName({ sheetName: stock.name, liveShortName: stock.live?.shortName, liveLongName: stock.live?.longName, ticker: stock.ticker })}</div>
                            {stock.live?.sector && <div className="text-xs text-muted-foreground truncate">{stock.live.sector}</div>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <div className="space-y-1.5">
                            <VerdictBadge verdict={stock.verdict} />
                            <ConfidenceMeter confidence={stock.confidence} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-600">
                          {price ? formatStockPrice(price, stock.region) : formatStockPrice(stock.currentPriceSheet, stock.region)}
                        </td>
                        <td className="px-3 py-2.5">
                          <FairValueCell stock={stock} />
                        </td>
                        <td className="px-3 py-2.5 min-w-[380px]" onClick={e => e.stopPropagation()}>
                          <ReturnStrip stock={stock} active={sortKey} onSort={handleSort} />
                        </td>
                        {isOwner && (
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {stock.portfolioData ? stock.portfolioData.quantity : '—'}
                          </td>
                        )}
                        {isOwner && (
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {stock.portfolioData ? formatStockPrice(stock.portfolioData.avgBuyPrice, stock.region) : '—'}
                          </td>
                        )}
                        {isOwner && (
                          <td className="px-3 py-2.5 text-right tabular-nums font-600">
                            {(() => {
                              if (!stock.portfolioData || !price) return <span className="text-muted-foreground">—</span>;
                              const pd = stock.portfolioData;
                              const pl = (price - pd.avgBuyPrice) * pd.quantity;
                              const pct = ((price - pd.avgBuyPrice) / pd.avgBuyPrice) * 100;
                              return (
                                <div>
                                  <div className={getChangeColor(pl)}>{formatStockPrice(pl, stock.region)}</div>
                                  <div className={`text-xs ${getChangeColor(pct)}`}>{formatPercent(pct)}</div>
                                </div>
                              );
                            })()}
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <Badge variant="secondary" className="text-xs bg-primary/10 text-primary/80 border-0 truncate max-w-[100px]">
                            {stock.originalTheme || 'Uncategorized'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
