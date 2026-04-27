'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, BarChart2, Activity, RefreshCw, Map } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import StockTable from '@/components/dashboard/StockTable';
import HeatmapView from '@/components/dashboard/HeatmapView';
import { formatPercent, formatPrice, getChangeBg, getChangeColor } from '@/lib/format';
import { MergedStock } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/providers/AuthProvider';

async function fetchStocks() {
  const res = await fetch('/api/stocks', { next: { revalidate: 0 } });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

export default function DashboardPage() {
  const router = useRouter();
  const { role } = useAuth();
  const isOwner = role === 'owner';
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['stocks'],
    queryFn: fetchStocks,
  });

  const [activeTab, setActiveTab] = useState('All');
  const [view, setView] = useState<'table' | 'heatmap'>('table');
  const [viewFilter, setViewFilter] = useState<'ALL' | 'WATCHLIST' | 'PORTFOLIO' | 'OVERLAP'>('ALL');

  const stocks: MergedStock[] = data?.stocks ?? [];
  const summary = data?.summary;

  const filteredByView = useMemo(() => {
    switch (viewFilter) {
      case 'WATCHLIST': return stocks.filter(s => s.isInWatchlist && !s.isInPortfolio);
      case 'PORTFOLIO': return isOwner ? stocks.filter(s => !s.isInWatchlist && s.isInPortfolio) : stocks;
      case 'OVERLAP': return isOwner ? stocks.filter(s => s.isInWatchlist && s.isInPortfolio) : stocks;
      default: return stocks;
    }
  }, [stocks, viewFilter, isOwner]);

  // Build tab list from unique categories of the currently filtered view
  const tabs = useMemo(() => {
    const cats = [...new Set(filteredByView.map((s: MergedStock) => s.category).filter(Boolean))].sort();
    return ['All', ...cats];
  }, [filteredByView]);

  const filtered = useMemo(() => {
    if (activeTab === 'All') return filteredByView;
    return filteredByView.filter((s: MergedStock) => s.category === activeTab || s.sheetTab === activeTab);
  }, [filteredByView, activeTab]);

  const topGainers = useMemo(() =>
    [...filteredByView]
      .filter((s: MergedStock) => s.live?.changePercent != null)
      .sort((a, b) => (b.live!.changePercent) - (a.live!.changePercent))
      .slice(0, 5),
    [filteredByView]
  );

  const topLosers = useMemo(() =>
    [...filteredByView]
      .filter((s: MergedStock) => s.live?.changePercent != null)
      .sort((a, b) => (a.live!.changePercent) - (b.live!.changePercent))
      .slice(0, 5),
    [filteredByView]
  );

  const avgChange = useMemo(() => {
    const withLive = filteredByView.filter((s: MergedStock) => s.live?.changePercent != null);
    if (!withLive.length) return null;
    return withLive.reduce((sum: number, s: MergedStock) => sum + s.live!.changePercent, 0) / withLive.length;
  }, [filteredByView]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-800 text-foreground tracking-tight">AlphaOS Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? 'Loading…' : `${filteredByView.length} stocks across ${tabs.length - 1} categories`}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-secondary/50 p-1 rounded-lg border border-white/8 mr-2">
            {[
              { id: 'ALL', label: 'All', icon: '' },
              { id: 'WATCHLIST', label: 'Watchlist', icon: '🧠' },
              ...(isOwner ? [
                { id: 'PORTFOLIO', label: 'Portfolio', icon: '💰' },
                { id: 'OVERLAP', label: 'Conviction', icon: '🔥' }
              ] : [])
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setViewFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-md text-xs font-500 transition-colors ${viewFilter === f.id ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {f.icon && <span className="mr-1">{f.icon}</span>}{f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 border border-white/8 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-primary' : ''}`} />
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Stocks',
            value: isLoading ? null : stocks.length,
            icon: BarChart2,
            format: (v: number) => v.toString(),
          },
          {
            label: isOwner ? 'Portfolio Today' : 'Watchlist Today',
            value: avgChange,
            icon: Activity,
            format: (v: number) => formatPercent(v),
            colored: true,
          },
          {
            label: 'Top Gainer',
            value: topGainers[0]?.ticker,
            sub: topGainers[0]?.live ? formatPercent(topGainers[0].live.changePercent) : null,
            icon: TrendingUp,
            isText: true,
            positive: true,
            onClick: () => topGainers[0] && router.push(`/stock/${topGainers[0].ticker}`),
          },
          {
            label: 'Top Loser',
            value: topLosers[0]?.ticker,
            sub: topLosers[0]?.live ? formatPercent(topLosers[0].live.changePercent) : null,
            icon: TrendingDown,
            isText: true,
            positive: false,
            onClick: () => topLosers[0] && router.push(`/stock/${topLosers[0].ticker}`),
          },
        ].map((card, i) => (
          <div
            key={i}
            onClick={card.onClick}
            className={`glass-card p-4 ${card.onClick ? 'cursor-pointer hover:border-primary/30 transition-all' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-500 text-muted-foreground uppercase tracking-wider">{card.label}</span>
              <card.icon className="w-4 h-4 text-muted-foreground/60" />
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-24 skeleton" />
            ) : (
              <div>
                <div className={`text-2xl font-800 tabular-nums ${
                  card.colored ? getChangeColor(card.value as number) :
                  card.positive ? 'text-gain' :
                  card.isText && !card.positive ? 'text-loss' : 'text-foreground'
                }`}>
                  {card.value != null ? (card.format ? card.format(card.value as number) : card.value) : '—'}
                </div>
                {card.sub && (
                  <div className={`text-sm font-500 mt-0.5 ${card.positive ? 'text-gain' : 'text-loss'}`}>
                    {card.sub}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Gainers / Losers strip */}
      {!isLoading && topGainers.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {[
            { title: '🚀 Top Gainers (Today)', items: topGainers, positive: true },
            { title: '📉 Top Losers (Today)', items: topLosers, positive: false },
          ].map(({ title, items, positive }) => (
            <div key={title} className="glass-card p-4">
              <h3 className="text-sm font-600 text-muted-foreground mb-3">{title}</h3>
              <div className="space-y-2">
                {items.map((s: MergedStock) => (
                  <div
                    key={s.ticker}
                    onClick={() => router.push(`/stock/${s.ticker}`)}
                    className="flex items-center justify-between cursor-pointer hover:bg-white/4 rounded-lg px-2 py-1 -mx-2 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-700 group-hover:text-primary transition-colors">{s.ticker}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[100px]">{s.live?.shortName || s.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">{formatPrice(s.live?.price ?? null)}</span>
                      <Badge className={`text-xs font-600 ${getChangeBg(s.live?.changePercent ?? null)}`} variant="secondary">
                        {formatPercent(s.live?.changePercent ?? null)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50 border border-white/8">
          <button
            onClick={() => setView('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-500 transition-colors ${view === 'table' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <BarChart2 className="w-3.5 h-3.5" /> Table
          </button>
          <button
            onClick={() => setView('heatmap')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-500 transition-colors ${view === 'heatmap' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Map className="w-3.5 h-3.5" /> Heatmap
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto scrollbar-thin pb-1">
          <TabsList className="bg-secondary/50 border border-white/8 h-auto p-1 gap-0.5 w-max">
            {tabs.map(tab => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="text-xs px-3 py-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-md transition-colors"
              >
                {tab}
                {tab !== 'All' && (
                  <span className="ml-1.5 text-muted-foreground/60">
                    {stocks.filter((s: MergedStock) => s.category === tab || s.sheetTab === tab).length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value={activeTab} className="mt-4">
          {view === 'heatmap' ? (
            <HeatmapView stocks={filtered} />
          ) : (
            <StockTable stocks={filtered} isLoading={isLoading} />
          )}
        </TabsContent>
      </Tabs>

      {isError && (
        <div className="glass-card p-6 text-center text-muted-foreground">
          <p className="text-sm">Failed to load stock data. Check your internet connection and try refreshing.</p>
        </div>
      )}
    </div>
  );
}
