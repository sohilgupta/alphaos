'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPrice, formatPercent, formatMarketCap, getChangeColor, getChangeBg, formatTicker, displayName } from '@/lib/format';
import { MergedStock } from '@/lib/types';

async function fetchStocks() {
  const res = await fetch('/api/stocks');
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

const DEFAULT_FILTERS = {
  minGain1M: -100,
  maxGain1M: 2000,
  minGain1Y: -100,
  maxGain1Y: 3000,
  minMarketCapB: 0,
  maxMarketCapB: 6000,
  categories: [] as string[],
  tabs: [] as string[],
};

export default function ScreenerPage() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ['stocks'], queryFn: fetchStocks });
  const stocks: MergedStock[] = data?.stocks ?? [];
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<'gain1Y' | 'gain1M' | 'changePercent' | 'marketCap'>('gain1Y');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const allCategories = useMemo(() => [...new Set(stocks.map(s => s.category).filter(Boolean))].sort(), [stocks]);
  const allTabs = useMemo(() => [...new Set(stocks.map(s => s.sheetTab).filter(Boolean))], [stocks]);

  const results = useMemo(() => {
    let filtered = stocks.filter(s => {
      if (s.gain1M != null && (s.gain1M < filters.minGain1M || s.gain1M > filters.maxGain1M)) return false;
      if (s.gain1Y != null && (s.gain1Y < filters.minGain1Y || s.gain1Y > filters.maxGain1Y)) return false;
      const mcap = s.live?.marketCap ? s.live.marketCap / 1e9 : (s.marketCapSheet ?? null);
      if (mcap != null && (mcap < filters.minMarketCapB || mcap > filters.maxMarketCapB)) return false;
      if (filters.categories.length > 0 && !filters.categories.includes(s.category)) return false;
      if (filters.tabs.length > 0 && !filters.tabs.includes(s.sheetTab)) return false;
      return true;
    });

    filtered.sort((a, b) => {
      let av = 0, bv = 0;
      switch (sortKey) {
        case 'gain1Y': av = a.gain1Y ?? -Infinity; bv = b.gain1Y ?? -Infinity; break;
        case 'gain1M': av = a.gain1M ?? -Infinity; bv = b.gain1M ?? -Infinity; break;
        case 'changePercent': av = a.live?.changePercent ?? -Infinity; bv = b.live?.changePercent ?? -Infinity; break;
        case 'marketCap': av = a.live?.marketCap ?? -Infinity; bv = b.live?.marketCap ?? -Infinity; break;
      }
      return sortDir === 'desc' ? bv - av : av - bv;
    });

    return filtered;
  }, [stocks, filters, sortKey, sortDir]);

  const resetFilters = () => setFilters(DEFAULT_FILTERS);
  const hasActiveFilters =
    filters.categories.length > 0 || filters.tabs.length > 0 ||
    filters.minGain1M !== DEFAULT_FILTERS.minGain1M ||
    filters.maxGain1M !== DEFAULT_FILTERS.maxGain1M ||
    filters.minGain1Y !== DEFAULT_FILTERS.minGain1Y;

  const toggleCategory = (cat: string) =>
    setFilters(f => ({
      ...f,
      categories: f.categories.includes(cat) ? f.categories.filter(c => c !== cat) : [...f.categories, cat],
    }));

  const toggleTab = (tab: string) =>
    setFilters(f => ({
      ...f,
      tabs: f.tabs.includes(tab) ? f.tabs.filter(t => t !== tab) : [...f.tabs, tab],
    }));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-800 text-foreground tracking-tight">Stock Screener</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Filter and rank stocks from your watchlist</p>
        </div>
        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-white/8 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all"
          >
            <X className="w-3.5 h-3.5" /> Reset Filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Panel */}
        <div className="lg:col-span-1 space-y-5">
          <div className="glass-card p-4 space-y-5">
            <div className="flex items-center gap-2 text-sm font-600 text-muted-foreground uppercase tracking-wider">
              <SlidersHorizontal className="w-4 h-4" /> Filters
            </div>

            {/* 1M Return */}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>1-Month Return</span>
                <span className="font-600 text-foreground">{filters.minGain1M}% → {filters.maxGain1M > 1000 ? '∞' : filters.maxGain1M + '%'}</span>
              </div>
              <Slider
                value={[filters.minGain1M, Math.min(filters.maxGain1M, 500)]}
                min={-100} max={500} step={5}
                onValueChange={(val) => setFilters(f => ({ ...f, minGain1M: (val as number[])[0], maxGain1M: (val as number[])[1] }))}
                className="w-full"
              />
            </div>

            {/* 1Y Return */}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>1-Year Return</span>
                <span className="font-600 text-foreground">{filters.minGain1Y}% → {filters.maxGain1Y > 1000 ? '∞' : filters.maxGain1Y + '%'}</span>
              </div>
              <Slider
                value={[filters.minGain1Y, Math.min(filters.maxGain1Y, 2000)]}
                min={-100} max={2000} step={10}
                onValueChange={(val) => setFilters(f => ({ ...f, minGain1Y: (val as number[])[0], maxGain1Y: (val as number[])[1] }))}
                className="w-full"
              />
            </div>

            {/* Sheet Tab */}
            <div>
              <div className="text-xs text-muted-foreground mb-2 font-500">Sheet Tab</div>
              <div className="flex flex-wrap gap-1.5">
                {allTabs.map(tab => (
                  <button
                    key={tab}
                    onClick={() => toggleTab(tab)}
                    className={`px-2.5 py-1 rounded-md text-xs font-500 border transition-colors ${
                      filters.tabs.includes(tab)
                        ? 'bg-primary/20 text-primary border-primary/30'
                        : 'text-muted-foreground border-white/10 hover:text-foreground hover:border-white/20'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Categories */}
            <div>
              <div className="text-xs text-muted-foreground mb-2 font-500">Categories</div>
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                {allCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`px-2.5 py-1 rounded-md text-xs font-500 border transition-colors ${
                      filters.categories.includes(cat)
                        ? 'bg-primary/20 text-primary border-primary/30'
                        : 'text-muted-foreground border-white/10 hover:text-foreground hover:border-white/20'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-3">
          {/* Sort bar */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">
              <span className="text-foreground font-600">{results.length}</span> results
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sort by:</span>
              {(['gain1Y', 'gain1M', 'changePercent', 'marketCap'] as const).map(k => (
                <button
                  key={k}
                  onClick={() => {
                    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                    else { setSortKey(k); setSortDir('desc'); }
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-500 transition-colors ${
                    sortKey === k ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  }`}
                >
                  {k === 'gain1Y' ? '1Y' : k === 'gain1M' ? '1M' : k === 'changePercent' ? 'Today' : 'Mkt Cap'}
                  {sortKey === k && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 skeleton" />)}
            </div>
          ) : results.length === 0 ? (
            <div className="glass-card p-10 text-center text-muted-foreground">
              No stocks match your filters. Try widening the range.
            </div>
          ) : (
            <div className="space-y-1.5">
              {results.map((s, i) => (
                <div
                  key={s.ticker}
                  onClick={() => router.push(`/stock/${s.ticker}`)}
                  className="glass-card px-4 py-3 cursor-pointer hover:border-primary/30 transition-all group flex items-center gap-4"
                >
                  <span className="text-xs text-muted-foreground/50 w-6 font-600 shrink-0">{i + 1}</span>
                  <div className="w-20 shrink-0 min-w-0">
                    <div className="text-sm font-700 text-foreground group-hover:text-primary transition-colors truncate">{formatTicker(s.ticker)}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-foreground/80 truncate">{displayName({ sheetName: s.name, liveShortName: s.live?.shortName, liveLongName: s.live?.longName, ticker: s.ticker })}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge className="text-xs bg-primary/10 text-primary/80 border-0 py-0">{s.category}</Badge>
                    </div>
                  </div>
                  <div className="text-sm tabular-nums font-600 text-foreground w-20 text-right">
                    {formatPrice(s.live?.price ?? s.currentPriceSheet ?? null)}
                  </div>
                  <Badge className={`text-xs font-600 w-20 justify-center ${getChangeBg(s.live?.changePercent ?? null)}`} variant="secondary">
                    {formatPercent(s.live?.changePercent ?? null)}
                  </Badge>
                  <div className={`text-sm font-600 tabular-nums w-20 text-right ${getChangeColor(s.gain1M)}`}>
                    {formatPercent(s.gain1M)} <span className="text-xs text-muted-foreground">1M</span>
                  </div>
                  <div className={`text-sm font-600 tabular-nums w-20 text-right ${getChangeColor(s.gain1Y)}`}>
                    {formatPercent(s.gain1Y)} <span className="text-xs text-muted-foreground">1Y</span>
                  </div>
                  <div className="text-xs text-muted-foreground w-20 text-right">
                    {formatMarketCap(s.live?.marketCap ?? (s.marketCapSheet ? s.marketCapSheet * 1e9 : null))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
