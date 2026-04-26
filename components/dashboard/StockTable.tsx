'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, LayoutGrid, List, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice, formatPercent, formatMarketCap, getChangeBg, getChangeColor } from '@/lib/format';
import { MergedStock } from '@/lib/types';

type SortKey = 'ticker' | 'name' | 'price' | 'changePercent' | 'marketCap' | 'pe' | 'gain1M' | 'gain1Y';
type SortDir = 'asc' | 'desc';

interface Props {
  stocks: MergedStock[];
  isLoading: boolean;
}

export default function StockTable({ stocks, isLoading }: Props) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('changePercent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'table' | 'grid'>('table');

  const sorted = useMemo(() => {
    let filtered = stocks.filter(s =>
      !search ||
      s.ticker.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase())
    );

    filtered.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      switch (sortKey) {
        case 'ticker': aVal = a.ticker; bVal = b.ticker; break;
        case 'name': aVal = a.name; bVal = b.name; break;
        case 'price': aVal = a.live?.price ?? -Infinity; bVal = b.live?.price ?? -Infinity; break;
        case 'changePercent': aVal = a.live?.changePercent ?? -Infinity; bVal = b.live?.changePercent ?? -Infinity; break;
        case 'marketCap': aVal = a.live?.marketCap ?? a.marketCapSheet ?? -Infinity; bVal = b.live?.marketCap ?? b.marketCapSheet ?? -Infinity; break;
        case 'pe': aVal = a.live?.pe ?? -Infinity; bVal = b.live?.pe ?? -Infinity; break;
        case 'gain1M': aVal = a.gain1M ?? -Infinity; bVal = b.gain1M ?? -Infinity; break;
        case 'gain1Y': aVal = a.gain1Y ?? -Infinity; bVal = b.gain1Y ?? -Infinity; break;
      }
      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return filtered;
  }, [stocks, sortKey, sortDir, search]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'desc'
      ? <ArrowDown className="w-3 h-3 text-primary" />
      : <ArrowUp className="w-3 h-3 text-primary" />;
  };

  const ColHeader = ({ k, label, className = '' }: { k: SortKey; label: string; className?: string }) => (
    <th
      className={`px-4 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors ${className}`}
      onClick={() => handleSort(k)}
    >
      <div className="flex items-center gap-1.5">
        {label} <SortIcon k={k} />
      </div>
    </th>
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-9 flex-1 skeleton" />
          <Skeleton className="h-9 w-20 skeleton" />
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="stock-search"
            placeholder="Search ticker, name, category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50 border-white/8 text-sm focus-visible:ring-primary/40"
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50 border border-white/8">
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
        <span className="text-xs text-muted-foreground">{sorted.length} stocks</span>
      </div>

      {view === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
                    {stock.isInWatchlist && stock.isInPortfolio && <span title="Watchlist + Portfolio">🔥</span>}
                    {stock.isInWatchlist && !stock.isInPortfolio && <span title="Watchlist Only">🧠</span>}
                    {!stock.isInWatchlist && stock.isInPortfolio && <span title="Portfolio Only">💰</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate max-w-[100px]">{stock.name}</div>
                </div>
                <ExternalLink className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors" />
              </div>
              <div className="text-lg font-700 tabular-nums">
                {stock.live?.price ? formatPrice(stock.live.price) : (stock.currentPriceSheet ? `$${stock.currentPriceSheet}` : '—')}
              </div>
              {stock.live?.changePercent != null && (
                <Badge className={`mt-1 text-xs font-600 ${getChangeBg(stock.live.changePercent)}`} variant="secondary">
                  {formatPercent(stock.live.changePercent)}
                </Badge>
              )}
              <div className="mt-2 pt-2 border-t border-white/8 flex justify-between text-xs text-muted-foreground">
                <span>1M</span>
                <span className={getChangeColor(stock.gain1M)}>{formatPercent(stock.gain1M)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-white/8 overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead style={{ background: 'oklch(0.10 0.006 264)' }}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider">Tag</th>
                  <ColHeader k="ticker" label="Ticker" />
                  <ColHeader k="name" label="Company" />
                  <ColHeader k="price" label="Price" className="text-right" />
                  <ColHeader k="changePercent" label="Day %" className="text-right" />
                  <th className="px-4 py-3 text-right text-xs font-600 text-muted-foreground uppercase tracking-wider">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-600 text-muted-foreground uppercase tracking-wider">Avg Price</th>
                  <th className="px-4 py-3 text-right text-xs font-600 text-muted-foreground uppercase tracking-wider">P&L</th>
                  <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider">Theme</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sorted.map(stock => {
                  const price = stock.live?.price;
                  const hi = stock.live?.week52High;
                  const lo = stock.live?.week52Low;
                  const rangePos = hi && lo && price ? ((price - lo) / (hi - lo)) * 100 : null;

                  return (
                    <tr
                      key={stock.ticker}
                      onClick={() => router.push(`/stock/${stock.ticker}`)}
                      className="ticker-row group"
                    >
                      {/* Tags */}
                      <td className="px-4 py-3 text-base">
                        {stock.isInWatchlist && stock.isInPortfolio && <span title="Watchlist + Portfolio">🔥</span>}
                        {stock.isInWatchlist && !stock.isInPortfolio && <span title="Watchlist Only">🧠</span>}
                        {!stock.isInWatchlist && stock.isInPortfolio && <span title="Portfolio Only">💰</span>}
                      </td>
                      {/* Ticker */}
                      <td className="px-4 py-3">
                        <span className="font-700 text-foreground group-hover:text-primary transition-colors">
                          {stock.ticker}
                        </span>
                      </td>
                      {/* Company */}
                      <td className="px-4 py-3">
                        <div className="max-w-[180px]">
                          <div className="text-foreground/90 font-500 truncate">{stock.live?.shortName || stock.name}</div>
                          {stock.live?.sector && (
                            <div className="text-xs text-muted-foreground truncate">{stock.live.sector}</div>
                          )}
                        </div>
                      </td>
                      {/* Price */}
                      <td className="px-4 py-3 text-right tabular-nums font-600">
                        {price ? formatPrice(price) : (stock.currentPriceSheet ? `$${stock.currentPriceSheet}` : '—')}
                      </td>
                      {/* Day % */}
                      <td className="px-4 py-3 text-right">
                        {stock.live?.changePercent != null ? (
                          <Badge className={`text-xs font-600 ${getChangeBg(stock.live.changePercent)}`} variant="secondary">
                            {formatPercent(stock.live.changePercent)}
                          </Badge>
                        ) : '—'}
                      </td>
                      {/* Qty */}
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {stock.portfolioData ? stock.portfolioData.quantity : '—'}
                      </td>
                      {/* Avg Price */}
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {stock.portfolioData ? formatPrice(stock.portfolioData.avgBuyPrice) : '—'}
                      </td>
                      {/* P&L */}
                      <td className="px-4 py-3 text-right tabular-nums font-600">
                        {(() => {
                          if (!stock.portfolioData || !price) return <span className="text-muted-foreground">—</span>;
                          const plValue = (price - stock.portfolioData.avgBuyPrice) * stock.portfolioData.quantity;
                          const plPercent = ((price - stock.portfolioData.avgBuyPrice) / stock.portfolioData.avgBuyPrice) * 100;
                          return (
                            <div>
                              <div className={getChangeColor(plValue)}>{formatPrice(plValue)}</div>
                              <div className={`text-xs ${getChangeColor(plPercent)}`}>{formatPercent(plPercent)}</div>
                            </div>
                          );
                        })()}
                      </td>
                      {/* Theme */}
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
      )}
    </div>
  );
}
