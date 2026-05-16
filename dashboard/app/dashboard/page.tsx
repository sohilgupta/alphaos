'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import { TrendingUp, TrendingDown, BarChart2, Activity, RefreshCw, Map } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import StockTable from '@/components/dashboard/StockTable';
import HeatmapView from '@/components/dashboard/HeatmapView';
import CopilotInsights from '@/components/dashboard/CopilotInsights';
import { formatPercent, formatStockPrice, formatTicker, getChangeBg, getChangeColor } from '@/lib/format';
import { MergedStock } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/providers/AuthProvider';

const STOCKS_CACHE_KEY = 'alphaos.stocks.v1';
// Keep localStorage cache short — if the network fetch fails on mobile we don't
// want to keep showing day-old data with no indication. 1h covers a tab reopen
// during the same session; anything older forces a real fetch.
const STOCKS_CACHE_MAX_AGE = 60 * 60 * 1000; // 1h

interface StocksResponse {
  stocks: MergedStock[];
  summary?: {
    totalStocks: number;
    totalWithLive: number;
    avgChange: number;
    topGainer: string | null;
    topLoser: string | null;
    lastUpdated: number;
  };
}

function readStocksCache(): StocksResponse | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(STOCKS_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed?.cachedAt || Date.now() - parsed.cachedAt > STOCKS_CACHE_MAX_AGE) return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}

function writeStocksCache(data: StocksResponse) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STOCKS_CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), data }));
  } catch {} // quota errors swallowed — non-critical
}

async function fetchStocks(forceRefresh = false): Promise<StocksResponse> {
  // Cache-bust the URL when forcing refresh so mobile browsers can't serve a
  // stale `/api/stocks?refresh=true` from HTTP cache. `cache: 'no-store'` is
  // belt-and-suspenders for the same problem.
  const url = forceRefresh
    ? `/api/stocks?refresh=true&t=${Date.now()}`
    : `/api/stocks`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

export default function DashboardPage() {
  const router = useRouter();
  const { role } = useAuth();
  const isOwner = role === 'owner';
  const [refreshToken, setRefreshToken] = useState(0);
  const { data, isLoading, isError, isFetching } = useQuery<StocksResponse>({
    queryKey: ['stocks', refreshToken],
    queryFn: () => fetchStocks(refreshToken > 0),
    // First paint: hydrate from localStorage (instant) while we kick off the fetch.
    initialData: () => readStocksCache(),
    // While refetching, keep showing the previous data instead of a spinner.
    placeholderData: keepPreviousData,
    staleTime: 4 * 60 * 1000,        // 4 min — no refetch on remount within this window
    refetchInterval: 5 * 60 * 1000,  // background refresh every 5 min
    refetchOnWindowFocus: false,
  });

  // Persist successful fetches to localStorage so the next session paints instantly.
  useEffect(() => {
    if (data?.stocks?.length) writeStocksCache(data);
  }, [data]);

  const [activeTab, setActiveTab] = useState('All');
  const [region, setRegion] = useState<'US' | 'INDIA'>('US');
  const [view, setView] = useState<'table' | 'heatmap'>('table');
  const [viewFilter, setViewFilter] = useState<'ALL' | 'WATCHLIST' | 'PORTFOLIO' | 'OVERLAP'>(() => {
    if (typeof window === 'undefined') return isOwner ? 'PORTFOLIO' : 'ALL';
    const params = new URLSearchParams(window.location.search);
    const filter = params.get('filter')?.toUpperCase();
    if (['ALL', 'WATCHLIST', 'PORTFOLIO', 'OVERLAP'].includes(filter ?? '')) {
      return filter as 'ALL' | 'WATCHLIST' | 'PORTFOLIO' | 'OVERLAP';
    }
    return isOwner ? 'PORTFOLIO' : 'ALL';
  });

  const stocks = useMemo<MergedStock[]>(() => data?.stocks ?? [], [data?.stocks]);

  const filteredByRegion = useMemo(() => stocks.filter(s => s.region === region), [stocks, region]);

  const filteredByView = useMemo(() => {
    switch (viewFilter) {
      case 'WATCHLIST': return filteredByRegion.filter(s => s.isInWatchlist);
      case 'PORTFOLIO': return isOwner ? filteredByRegion.filter(s => s.isInPortfolio) : filteredByRegion;
      case 'OVERLAP': return isOwner ? filteredByRegion.filter(s => s.isInWatchlist && s.isInPortfolio) : filteredByRegion;
      default: return filteredByRegion;
    }
  }, [filteredByRegion, viewFilter, isOwner]);

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
    <div className="mx-auto max-w-screen-xl space-y-4 overflow-hidden px-4 py-4 md:space-y-6 md:px-8 md:py-6">
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-800 tracking-tight text-foreground">
              {viewFilter === 'PORTFOLIO' ? 'Portfolio' : 'Watchlist'}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isLoading ? 'Loading…' : `${filtered.length} ${region === 'US' ? 'US' : 'Indian'} stocks`}
            </p>
          </div>
          <button
            onClick={() => setRefreshToken(Date.now())}
            disabled={isFetching}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-secondary/50 text-muted-foreground"
            aria-label="Refresh stocks"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin text-primary' : ''}`} />
          </button>
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden flex-col gap-4 md:flex xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-800 text-foreground tracking-tight">AlphaOS Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? 'Loading…' : `${filteredByView.length} ${region === 'US' ? 'US' : 'Indian'} stocks across ${tabs.length - 1} categories`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex bg-secondary/50 p-1 rounded-lg border border-white/8 overflow-x-auto w-full sm:w-auto">
            {[
              { id: 'US', label: '🇺🇸 US Stocks' },
              { id: 'INDIA', label: '🇮🇳 Indian Stocks' },
            ].map(option => (
              <button
                key={option.id}
                onClick={() => {
                  setRegion(option.id as 'US' | 'INDIA');
                  setActiveTab('All');
                  setViewFilter('ALL');
                }}
                className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-600 transition-colors ${region === option.id ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex bg-secondary/50 p-1 rounded-lg border border-white/8 overflow-x-auto w-full sm:w-auto">
            {[
              { id: 'ALL', label: 'All', icon: '' },
              { id: 'WATCHLIST', label: 'Watchlist', icon: '' },
              ...(isOwner ? [
                { id: 'PORTFOLIO', label: 'Portfolio', icon: '' },
                { id: 'OVERLAP', label: 'Conviction', icon: '' }
              ] : [])
            ].map(f => (
              <button
                key={f.id}
                onClick={() => { setViewFilter(f.id as 'ALL' | 'WATCHLIST' | 'PORTFOLIO' | 'OVERLAP'); setActiveTab('All'); }}
                className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-500 transition-colors ${viewFilter === f.id ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {f.icon && <span className="mr-1">{f.icon}</span>}{f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setRefreshToken(Date.now())}
            disabled={isFetching}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 border border-white/8 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-primary' : ''}`} />
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          {isOwner && !isLoading && stocks.length > 0 && (
            <CopilotInsights stocks={stocks} region={region} />
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="hidden grid-cols-2 gap-4 md:grid lg:grid-cols-4">
        {[
          {
            label: 'Total Stocks',
            value: isLoading ? null : filteredByRegion.length,
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
            value: topGainers[0] ? formatTicker(topGainers[0].ticker) : undefined,
            sub: topGainers[0]?.live ? formatPercent(topGainers[0].live.changePercent) : null,
            icon: TrendingUp,
            isText: true,
            positive: true,
            onClick: () => topGainers[0] && router.push(`/stock/${topGainers[0].ticker}`),
          },
          {
            label: 'Top Loser',
            value: topLosers[0] ? formatTicker(topLosers[0].ticker) : undefined,
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
        <div className="hidden grid-cols-1 gap-4 md:grid md:grid-cols-2">
          {[
            { title: 'Top Gainers (Today)', items: topGainers, positive: true },
            { title: 'Top Losers (Today)', items: topLosers, positive: false },
          ].map(({ title, items }) => (
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
                      <span className="text-sm font-700 group-hover:text-primary transition-colors">{formatTicker(s.ticker)}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[100px]">{s.live?.shortName || s.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">{formatStockPrice(s.live?.price ?? null, s.region)}</span>
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
      <div className="hidden items-center gap-3 md:flex">
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
          <div className="mb-3 flex gap-2 overflow-x-auto md:hidden">
            {[
              { id: 'US', label: '🇺🇸 US' },
              { id: 'INDIA', label: '🇮🇳 India' },
            ].map(option => (
              <button
                key={option.id}
                onClick={() => {
                  setRegion(option.id as 'US' | 'INDIA');
                  setActiveTab('All');
                  setViewFilter('ALL');
                }}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-700 transition-colors ${region === option.id ? 'border-primary/30 bg-primary/20 text-primary' : 'border-white/8 bg-secondary/40 text-muted-foreground'}`}
              >
                {option.label}
              </button>
            ))}
            {[
              { id: 'WATCHLIST', label: 'Watchlist' },
              ...(isOwner ? [{ id: 'PORTFOLIO', label: 'Portfolio' }] : []),
            ].map(option => (
              <button
                key={option.id}
                onClick={() => {
                  setViewFilter(option.id as 'WATCHLIST' | 'PORTFOLIO');
                  setActiveTab('All');
                }}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-700 transition-colors ${viewFilter === option.id ? 'border-primary/30 bg-primary/20 text-primary' : 'border-white/8 bg-secondary/40 text-muted-foreground'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
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
                    {filteredByView.filter((s: MergedStock) => s.category === tab || s.sheetTab === tab).length}
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
