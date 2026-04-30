'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, LayoutGrid, List, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPercent, formatStockPrice, getChangeBg, getChangeColor } from '@/lib/format';
import { MergedStock } from '@/lib/types';
import { useAuth } from '@/components/providers/AuthProvider';

type SortKey = 'ticker' | 'name' | 'price' | 'changePercent' | 'marketCap' | 'pe' | 'gain1M' | 'gain1Y';
type SortDir = 'asc' | 'desc';

interface Props {
  stocks: MergedStock[];
  isLoading: boolean;
}

function returnsForStock(stock: MergedStock) {
  return [
    { label: '1D', value: stock.live?.changePercent ?? null },
    { label: '1W', value: stock.gain1W },
    { label: '1M', value: stock.gain1M },
    { label: '1Y', value: stock.gain1Y },
    { label: '3Y', value: stock.gain3Y },
  ];
}

function ReturnCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="shrink-0 min-w-16 rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-2 text-center">
      <div className="text-[10px] font-600 text-muted-foreground uppercase">{label}</div>
      <div className={`mt-0.5 text-xs font-700 tabular-nums ${getChangeColor(value)}`}>
        {formatPercent(value)}
      </div>
    </div>
  );
}

function ReturnStrip({ stock }: { stock: MergedStock }) {
  return (
    <div className="overflow-x-auto w-full">
      <div className="flex gap-2 min-w-max">
        {returnsForStock(stock).map((item) => (
          <ReturnCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </div>
  );
}

export default function StockTable({ stocks, isLoading }: Props) {
  const router = useRouter();
  const { role } = useAuth();
  const isOwner = role === 'owner';
  const [sortKey, setSortKey] = useState<SortKey>('changePercent');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'table' | 'grid'>('table');

  const sorted = useMemo(() => {
    const filtered = stocks.filter(s =>
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

  const renderSortIcon = (k: SortKey) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'desc'
      ? <ArrowDown className="w-3 h-3 text-primary" />
      : <ArrowUp className="w-3 h-3 text-primary" />;
  };

  const renderColHeader = (k: SortKey, label: string, className = '') => (
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
          <Skeleton className="h-9 w-20 skeleton" />
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-full overflow-hidden">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                <ReturnStrip stock={stock} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {sorted.map(stock => {
              const price = stock.live?.price;
              return (
                <div
                  key={stock.ticker}
                  onClick={() => router.push(`/stock/${stock.ticker}`)}
                  className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-800 text-foreground">{stock.ticker}</span>
                        <Badge variant="secondary" className="text-[10px]">{stock.region === 'INDIA' ? 'India' : 'US'}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{stock.live?.shortName || stock.name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-700 tabular-nums">{price ? formatStockPrice(price, stock.region) : formatStockPrice(stock.currentPriceSheet, stock.region)}</div>
                      <Badge className={`mt-1 text-xs font-600 ${getChangeBg(stock.live?.changePercent ?? null)}`} variant="secondary">
                        {formatPercent(stock.live?.changePercent ?? null)}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3">
                    <ReturnStrip stock={stock} />
                  </div>
                  {isOwner && stock.portfolioData && (
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/8 pt-3 text-xs">
                      <div>
                        <div className="text-muted-foreground">Qty</div>
                        <div className="font-700 tabular-nums">{stock.portfolioData.quantity}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Avg</div>
                        <div className="font-700 tabular-nums">{formatStockPrice(stock.portfolioData.avgBuyPrice, stock.region)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">P&L</div>
                        <div className={`font-700 tabular-nums ${getChangeColor(stock.pnl ?? null)}`}>{formatStockPrice(stock.pnl ?? null, stock.region)}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden md:block rounded-xl border border-white/8 overflow-hidden">
            <div className="overflow-x-auto w-full scrollbar-thin">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="sticky top-0 z-10" style={{ background: 'oklch(0.10 0.006 264)' }}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider">Tag</th>
                  {renderColHeader('ticker', 'Ticker')}
                  {renderColHeader('name', 'Company')}
                  {renderColHeader('price', 'Price', 'text-right')}
                  {renderColHeader('changePercent', 'Day %', 'text-right')}
                  <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wider">Returns</th>
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
                      {/* Tags */}
                      <td className="px-4 py-3 text-base">
                        {isOwner && stock.isInWatchlist && stock.isInPortfolio && <Badge variant="secondary" className="text-[10px]">Both</Badge>}
                        {stock.isInWatchlist && !stock.isInPortfolio && <Badge variant="secondary" className="text-[10px]">Watch</Badge>}
                        {isOwner && !stock.isInWatchlist && stock.isInPortfolio && <Badge variant="secondary" className="text-[10px]">Port</Badge>}
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
                        {price ? formatStockPrice(price, stock.region) : formatStockPrice(stock.currentPriceSheet, stock.region)}
                      </td>
                      {/* Day % */}
                      <td className="px-4 py-3 text-right">
                        {stock.live?.changePercent != null ? (
                          <Badge className={`text-xs font-600 ${getChangeBg(stock.live.changePercent)}`} variant="secondary">
                            {formatPercent(stock.live.changePercent)}
                          </Badge>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 min-w-[360px]">
                        <ReturnStrip stock={stock} />
                      </td>
                      {/* Qty */}
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
        </>
      )}
    </div>
  );
}
