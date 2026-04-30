'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, LayoutGrid, List, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPercent, formatStockPrice, getChangeBg, getChangeColor } from '@/lib/format';
import { MergedStock } from '@/lib/types';
import { useAuth } from '@/components/providers/AuthProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

type Timeframe = '1D' | '1W' | '1M' | '3M' | '1Y';
type ColSortKey = 'ticker' | 'name' | 'price' | 'marketCap' | 'pe';
type SortKey = Timeframe | ColSortKey;
type SortDir = 'asc' | 'desc';
type QuickFilter = { type: 'top' | 'bottom'; timeframe: Timeframe } | null;

interface Props {
  stocks: MergedStock[];
  isLoading: boolean;
}

// ─── Timeframe config ──────────────────────────────────────────────────────────

const TIMEFRAMES: { label: Timeframe; getValue: (s: MergedStock) => number | null }[] = [
  { label: '1D', getValue: s => s.live?.changePercent ?? null },
  { label: '1W', getValue: s => s.gain1W },
  { label: '1M', getValue: s => s.gain1M },
  { label: '3M', getValue: s => s.gain6M },   // gain6M is the closest available field
  { label: '1Y', getValue: s => s.gain1Y },
];

function getTimeframeValue(s: MergedStock, tf: Timeframe): number {
  const entry = TIMEFRAMES.find(t => t.label === tf);
  return entry?.getValue(s) ?? -Infinity;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ReturnCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number | null;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 min-w-16 rounded-md border px-2.5 py-2 text-center transition-colors
        ${active
          ? 'border-primary/40 bg-primary/10'
          : 'border-white/8 bg-white/[0.03] hover:border-white/16 hover:bg-white/[0.06]'}
        ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className={`text-[10px] font-600 uppercase ${active ? 'text-primary' : 'text-muted-foreground'}`}>
        {label}
      </div>
      <div className={`mt-0.5 text-xs font-700 tabular-nums ${getChangeColor(value)}`}>
        {formatPercent(value)}
      </div>
    </button>
  );
}

function ReturnStrip({
  stock,
  activeSortKey,
  onSort,
}: {
  stock: MergedStock;
  activeSortKey: SortKey;
  onSort: (tf: Timeframe) => void;
}) {
  return (
    <div className="overflow-x-auto w-full">
      <div className="flex gap-2 min-w-max">
        {TIMEFRAMES.map(({ label, getValue }) => (
          <ReturnCard
            key={label}
            label={label}
            value={getValue(stock)}
            active={activeSortKey === label}
            onClick={() => onSort(label)}
          />
        ))}
      </div>
    </div>
  );
}

function signalsForStock(stock: MergedStock, isOwner: boolean) {
  const signals: string[] = [];
  const change = stock.live?.changePercent ?? null;
  if (change != null && change > 2) signals.push('Momentum');
  if (stock.gain1M != null && stock.gain1M > 10) signals.push('Strong 1M');
  if (stock.gain1Y != null && stock.gain1Y > 40) signals.push('Breakout');
  if (stock.convictionScore > 7) signals.push('High Conviction');
  if (isOwner && stock.isInPortfolio) signals.push('Portfolio');
  if (!signals.length && stock.originalTheme) signals.push(stock.originalTheme);
  return signals.slice(0, 3);
}

function MobileStockCard({
  stock,
  isOwner,
  activeSortKey,
  onSort,
  onOpen,
}: {
  stock: MergedStock;
  isOwner: boolean;
  activeSortKey: SortKey;
  onSort: (tf: Timeframe) => void;
  onOpen: () => void;
}) {
  const price = stock.live?.price ?? stock.currentPriceSheet ?? null;
  const change = stock.live?.changePercent ?? null;
  const signals = signalsForStock(stock, isOwner);

  return (
    <div className="w-full rounded-2xl border border-white/8 bg-zinc-950/70 p-4 text-left shadow-sm">
      <button
        type="button"
        onClick={onOpen}
        onContextMenu={e => e.preventDefault()}
        className="w-full text-left active:opacity-80"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-700 text-foreground">{stock.live?.shortName || stock.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-xs font-600 text-muted-foreground">{stock.ticker}</p>
              <Badge variant="secondary" className="rounded-md px-1.5 py-0 text-[10px]">
                {stock.region === 'INDIA' ? 'India' : 'US'}
              </Badge>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-800 tabular-nums text-foreground">{formatStockPrice(price, stock.region)}</p>
            <p className={`mt-1 text-sm font-700 tabular-nums ${getChangeColor(change)}`}>
              {formatPercent(change)}
            </p>
          </div>
        </div>
      </button>

      <div className="mt-3">
        <ReturnStrip stock={stock} activeSortKey={activeSortKey} onSort={onSort} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {signals.map(signal => (
          <span
            key={signal}
            className="rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-600 text-muted-foreground"
          >
            {signal}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function StockTable({ stocks, isLoading }: Props) {
  const router = useRouter();
  const { role } = useAuth();
  const isOwner = role === 'owner';

  const [sortKey, setSortKey] = useState<SortKey>('1D');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = useMemo(() => {
    const searched = stocks.filter(s =>
      !search ||
      s.ticker.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase())
    );

    // Quick filter: rank by timeframe, slice top/bottom 10, then return as-is
    if (quickFilter) {
      return [...searched]
        .sort((a, b) => {
          const diff = getTimeframeValue(b, quickFilter.timeframe) - getTimeframeValue(a, quickFilter.timeframe);
          return quickFilter.type === 'top' ? diff : -diff;
        })
        .slice(0, 10);
    }

    return [...searched].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      if (['1D', '1W', '1M', '3M', '1Y'].includes(sortKey)) {
        aVal = getTimeframeValue(a, sortKey as Timeframe);
        bVal = getTimeframeValue(b, sortKey as Timeframe);
      } else {
        switch (sortKey as ColSortKey) {
          case 'ticker':    aVal = a.ticker; bVal = b.ticker; break;
          case 'name':      aVal = a.name;   bVal = b.name;   break;
          case 'price':     aVal = a.live?.price ?? -Infinity;     bVal = b.live?.price ?? -Infinity;     break;
          case 'marketCap': aVal = a.live?.marketCap ?? a.marketCapSheet ?? -Infinity; bVal = b.live?.marketCap ?? b.marketCapSheet ?? -Infinity; break;
          case 'pe':        aVal = a.live?.pe ?? -Infinity;        bVal = b.live?.pe ?? -Infinity;        break;
          default:          aVal = 0; bVal = 0;
        }
      }

      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [stocks, sortKey, sortDir, search, quickFilter]);

  const renderSortIcon = (k: SortKey) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'desc'
      ? <ArrowDown className="w-3 h-3 text-primary" />
      : <ArrowUp className="w-3 h-3 text-primary" />;
  };

  const renderColHeader = (k: ColSortKey, label: string, className = '') => (
    <th
      className={`px-4 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors ${className}`}
      onClick={() => handleSort(k)}
    >
      <div className="flex items-center gap-1.5">
        {label} {renderSortIcon(k)}
      </div>
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

  // ─── Quick filter bar ─────────────────────────────────────────────────────────
  const QuickFilterBar = () => (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      <span className="shrink-0 text-xs text-muted-foreground/60 pr-1">Best:</span>
      {TIMEFRAMES.map(({ label }) => {
        const topActive = quickFilter?.type === 'top' && quickFilter.timeframe === label;
        const botActive = quickFilter?.type === 'bottom' && quickFilter.timeframe === label;
        return (
          <div key={label} className="flex shrink-0 rounded-md overflow-hidden border border-white/8">
            <button
              onClick={() => setQuickFilter(topActive ? null : { type: 'top', timeframe: label })}
              className={`px-2 py-1 text-xs font-600 transition-colors
                ${topActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-secondary/40 text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10'}`}
            >
              ↑{label}
            </button>
            <div className="w-px bg-white/8" />
            <button
              onClick={() => setQuickFilter(botActive ? null : { type: 'bottom', timeframe: label })}
              className={`px-2 py-1 text-xs font-600 transition-colors
                ${botActive ? 'bg-red-500/20 text-red-400' : 'bg-secondary/40 text-muted-foreground hover:text-red-400 hover:bg-red-500/10'}`}
            >
              ↓{label}
            </button>
          </div>
        );
      })}
      {quickFilter && (
        <button
          onClick={() => setQuickFilter(null)}
          className="shrink-0 px-2 py-1 rounded-md text-xs font-600 text-muted-foreground border border-white/8 bg-secondary/40 hover:text-foreground transition-colors"
        >
          ✕ Reset
        </button>
      )}
    </div>
  );

  // ─── Timeframe sort bar (shared between table + mobile) ─────────────────────
  const TimeframeSortBar = () => (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      <span className="shrink-0 text-xs text-muted-foreground/60 pr-1">Sort:</span>
      {TIMEFRAMES.map(({ label }) => {
        const active = sortKey === label;
        return (
          <button
            key={label}
            onClick={() => handleSort(label)}
            className={`shrink-0 flex items-center gap-0.5 px-2.5 py-1.5 rounded-md text-xs font-600 border transition-colors
              ${active
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'bg-secondary/40 text-muted-foreground border-white/8 hover:text-foreground hover:bg-secondary/60'}`}
          >
            {label}
            {active && (
              sortDir === 'desc'
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronUp className="w-3 h-3" />
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3 max-w-full overflow-hidden">
      {/* Controls row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="stock-search"
            placeholder="Search ticker, name, category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-white/8 text-sm focus-visible:ring-primary/40"
          />
        </div>

        <TimeframeSortBar />

        <QuickFilterBar />

        <div className="hidden items-center gap-1 p-1 rounded-lg bg-secondary/50 border border-white/8 md:flex">
          <button
            onClick={() => setView('table')}
            className={`p-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('grid')}
            className={`p-1.5 rounded-md transition-colors ${view === 'grid' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>

        <span className="text-xs text-muted-foreground">
          {quickFilter
            ? <span className={quickFilter.type === 'top' ? 'text-emerald-400' : 'text-red-400'}>
                {quickFilter.type === 'top' ? '↑' : '↓'} Top {sorted.length} · {quickFilter.timeframe}
              </span>
            : `${sorted.length} stocks`}
        </span>
      </div>

      {view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {sorted.map(stock => (
            <div
              key={stock.ticker}
              onClick={() => router.push(`/stock/${stock.ticker}`)}
              className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-all hover:shadow-lg hover:shadow-primary/5 group"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-1">
                    <div className="text-sm font-700 text-foreground">{stock.ticker}</div>
                    {isOwner && stock.isInWatchlist && stock.isInPortfolio && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Both</Badge>}
                    {stock.isInWatchlist && !stock.isInPortfolio && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Watch</Badge>}
                    {isOwner && !stock.isInWatchlist && stock.isInPortfolio && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Port</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate max-w-[100px]">{stock.name}</div>
                </div>
                <ExternalLink className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors" />
              </div>
              <div className="text-lg font-700 tabular-nums">
                {stock.live?.price ? formatStockPrice(stock.live.price, stock.region) : formatStockPrice(stock.currentPriceSheet, stock.region)}
              </div>
              {stock.live?.changePercent != null && (
                <Badge className={`mt-1 text-xs font-600 ${getChangeBg(stock.live.changePercent)}`} variant="secondary">
                  {formatPercent(stock.live.changePercent)}
                </Badge>
              )}
              <div className="mt-3 pt-3 border-t border-white/8">
                <ReturnStrip stock={stock} activeSortKey={sortKey} onSort={handleSort} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {sorted.map(stock => (
              <MobileStockCard
                key={stock.ticker}
                stock={stock}
                isOwner={isOwner}
                activeSortKey={sortKey}
                onSort={handleSort}
                onOpen={() => router.push(`/stock/${stock.ticker}`)}
              />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-white/8 overflow-hidden">
            <div className="overflow-x-auto w-full scrollbar-thin">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="sticky top-0 z-10" style={{ background: 'oklch(0.10 0.006 264)' }}>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider">Tag</th>
                    {renderColHeader('ticker', 'Ticker')}
                    {renderColHeader('name', 'Company')}
                    <th
                      className="px-4 py-3 text-right text-xs font-600 text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort('price' as ColSortKey)}
                    >
                      <div className="flex items-center justify-end gap-1.5">Price {renderSortIcon('price')}</div>
                    </th>
                    {/* Returns header with per-timeframe sort buttons */}
                    <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider">
                      <div className="flex items-center gap-1.5">
                        {TIMEFRAMES.map(({ label }) => {
                          const active = sortKey === label;
                          return (
                            <button
                              key={label}
                              onClick={() => handleSort(label)}
                              className={`flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-700 uppercase tracking-wider border transition-colors
                                ${active
                                  ? 'bg-primary/15 text-primary border-primary/30'
                                  : 'text-muted-foreground border-white/8 hover:text-foreground hover:border-white/20'}`}
                            >
                              {label}
                              {active && (
                                sortDir === 'desc'
                                  ? <ChevronDown className="w-2.5 h-2.5" />
                                  : <ChevronUp className="w-2.5 h-2.5" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </th>
                    {isOwner && <th className="px-4 py-3 text-right text-xs font-600 text-muted-foreground uppercase tracking-wider">Qty</th>}
                    {isOwner && <th className="px-4 py-3 text-right text-xs font-600 text-muted-foreground uppercase tracking-wider">Avg Price</th>}
                    {isOwner && <th className="px-4 py-3 text-right text-xs font-600 text-muted-foreground uppercase tracking-wider">P&L</th>}
                    <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider">Theme</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sorted.map(stock => {
                    const price = stock.live?.price;
                    return (
                      <tr
                        key={stock.ticker}
                        onClick={() => router.push(`/stock/${stock.ticker}`)}
                        className="ticker-row group"
                      >
                        <td className="px-4 py-3">
                          {isOwner && stock.isInWatchlist && stock.isInPortfolio && <Badge variant="secondary" className="text-[10px]">Both</Badge>}
                          {stock.isInWatchlist && !stock.isInPortfolio && <Badge variant="secondary" className="text-[10px]">Watch</Badge>}
                          {isOwner && !stock.isInWatchlist && stock.isInPortfolio && <Badge variant="secondary" className="text-[10px]">Port</Badge>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-700 text-foreground group-hover:text-primary transition-colors">
                            {stock.ticker}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="max-w-[180px]">
                            <div className="text-foreground/90 font-500 truncate">{stock.live?.shortName || stock.name}</div>
                            {stock.live?.sector && (
                              <div className="text-xs text-muted-foreground truncate">{stock.live.sector}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-600">
                          {price ? formatStockPrice(price, stock.region) : formatStockPrice(stock.currentPriceSheet, stock.region)}
                        </td>
                        <td className="px-4 py-3 min-w-[360px]" onClick={e => e.stopPropagation()}>
                          <ReturnStrip stock={stock} activeSortKey={sortKey} onSort={handleSort} />
                        </td>
                        {isOwner && (
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {stock.portfolioData ? stock.portfolioData.quantity : '—'}
                          </td>
                        )}
                        {isOwner && (
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {stock.portfolioData ? formatStockPrice(stock.portfolioData.avgBuyPrice, stock.region) : '—'}
                          </td>
                        )}
                        {isOwner && (
                          <td className="px-4 py-3 text-right tabular-nums font-600">
                            {(() => {
                              if (!stock.portfolioData || !price) return <span className="text-muted-foreground">—</span>;
                              const plValue = (price - stock.portfolioData.avgBuyPrice) * stock.portfolioData.quantity;
                              const plPercent = ((price - stock.portfolioData.avgBuyPrice) / stock.portfolioData.avgBuyPrice) * 100;
                              return (
                                <div>
                                  <div className={getChangeColor(plValue)}>{formatStockPrice(plValue, stock.region)}</div>
                                  <div className={`text-xs ${getChangeColor(plPercent)}`}>{formatPercent(plPercent)}</div>
                                </div>
                              );
                            })()}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-xs bg-primary/10 text-primary/80 border-0 truncate max-w-[120px]">
                              {stock.originalTheme || 'Uncategorized'}
                            </Badge>
                            {stock.suggestedTheme && stock.originalTheme !== stock.suggestedTheme && (
                              <span title={`Suggested: ${stock.suggestedTheme}`} className="text-yellow-500 text-xs">⚠️</span>
                            )}
                          </div>
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
