'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPercent, formatPrice, getChangeBg, getChangeColor, getHeatmapColor } from '@/lib/format';
import { MergedStock, CategoryPerformance } from '@/lib/types';

async function fetchStocks() {
  const res = await fetch('/api/stocks');
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ['stocks'], queryFn: fetchStocks });
  const stocks: MergedStock[] = data?.stocks ?? [];
  const portfolioTotalValue = useMemo(() => stocks.filter(s => s.isInPortfolio).reduce((sum, s) => sum + (s.portfolioData?.investedValue || 0), 0), [stocks]);

  // Portfolio Intelligence
  const portfolioIntelligence = useMemo(() => {
    const impulsive = stocks.filter(s => s.isInPortfolio && !s.isInWatchlist);
    const convictionButNotBought = stocks.filter(s => s.isInWatchlist && !s.isInPortfolio && s.convictionScore > 7);
    
    // Group by theme (suggested or original)
    const themeMap = new Map<string, { tracked: number; held: number; investedValue: number }>();
    
    for (const s of stocks) {
      const theme = s.suggestedTheme || s.originalTheme || 'Uncategorized';
      if (!themeMap.has(theme)) {
        themeMap.set(theme, { tracked: 0, held: 0, investedValue: 0 });
      }
      const t = themeMap.get(theme)!;
      if (s.isInWatchlist) t.tracked++;
      if (s.isInPortfolio) {
        t.held++;
        t.investedValue += (s.portfolioData?.investedValue || 0);
      }
    }
    
    const themeAllocations = [...themeMap.entries()]
      .filter(([_, data]) => data.tracked > 0 || data.held > 0)
      .map(([theme, data]) => ({
        theme,
        tracked: data.tracked,
        held: data.held,
        investedValue: data.investedValue,
        allocationPercent: portfolioTotalValue > 0 ? (data.investedValue / portfolioTotalValue) * 100 : 0
      }))
      .sort((a, b) => b.investedValue - a.investedValue);

    return { impulsive, convictionButNotBought, themeAllocations };
  }, [stocks, portfolioTotalValue]);

  // Category Performance
  const categoryPerf: CategoryPerformance[] = useMemo(() => {
    const map = new Map<string, MergedStock[]>();
    for (const s of stocks) {
      if (!s.category) continue;
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return [...map.entries()].map(([category, items]) => {
      const withLive = items.filter(s => s.live?.changePercent != null);
      const avgChange = withLive.length
        ? withLive.reduce((a, s) => a + s.live!.changePercent, 0) / withLive.length : 0;
      const with1M = items.filter(s => s.gain1M != null);
      const avgGain1M = with1M.length
        ? with1M.reduce((a, s) => a + (s.gain1M ?? 0), 0) / with1M.length : 0;
      const with1Y = items.filter(s => s.gain1Y != null);
      const avgGain1Y = with1Y.length
        ? with1Y.reduce((a, s) => a + (s.gain1Y ?? 0), 0) / with1Y.length : 0;

      const sorted1Y = [...items].sort((a, b) => (b.gain1Y ?? -Infinity) - (a.gain1Y ?? -Infinity));
      return {
        category,
        count: items.length,
        avgChange,
        avgGain1M,
        avgGain1Y,
        topPerformer: sorted1Y[0]?.ticker ?? '',
        worstPerformer: sorted1Y[sorted1Y.length - 1]?.ticker ?? '',
      };
    }).sort((a, b) => b.avgGain1Y - a.avgGain1Y);
  }, [stocks]);

  // Top 10 gainers / losers by 1Y
  const sortedBy1Y = useMemo(() =>
    [...stocks].filter(s => s.gain1Y != null).sort((a, b) => (b.gain1Y ?? 0) - (a.gain1Y ?? 0)),
    [stocks]
  );
  const gainers1Y = sortedBy1Y.slice(0, 10);
  const losers1Y = [...sortedBy1Y].reverse().slice(0, 10);

  const avgPortfolioToday = useMemo(() => {
    const w = stocks.filter(s => s.live?.changePercent != null);
    return w.length ? w.reduce((a, s) => a + s.live!.changePercent, 0) / w.length : 0;
  }, [stocks]);

  const avg1M = useMemo(() => {
    const w = stocks.filter(s => s.gain1M != null);
    return w.length ? w.reduce((a, s) => a + (s.gain1M ?? 0), 0) / w.length : 0;
  }, [stocks]);

  const avg1Y = useMemo(() => {
    const w = stocks.filter(s => s.gain1Y != null);
    return w.length ? w.reduce((a, s) => a + (s.gain1Y ?? 0), 0) / w.length : 0;
  }, [stocks]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="glass px-3 py-2 rounded-lg text-xs space-y-0.5">
        <div className="font-600 text-foreground truncate max-w-[160px]">{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} className={p.value >= 0 ? 'text-gain' : 'text-loss'}>
            {p.name}: {formatPercent(p.value)}
          </div>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48 skeleton" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 skeleton" />)}
        </div>
        <Skeleton className="h-72 skeleton" />
        <Skeleton className="h-72 skeleton" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-800 text-foreground tracking-tight">Portfolio Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Equal-weighted performance across all {stocks.length} positions</p>
      </div>

      {/* Portfolio Intelligence Section */}
      <div className="glass-card p-5 border-primary/20">
        <h2 className="text-lg font-700 text-primary mb-4 flex items-center gap-2">
          🧠 Hedge Fund Intelligence
        </h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Theme Allocation vs Tracking */}
          <div>
            <h3 className="text-sm font-600 text-muted-foreground uppercase tracking-wider mb-3">Theme Allocation vs Tracked</h3>
            <div className="space-y-3">
              {portfolioIntelligence.themeAllocations.slice(0, 5).map(t => (
                <div key={t.theme} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-600 text-foreground">{t.theme}</span>
                    <span className="tabular-nums font-600 text-primary">{t.allocationPercent.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-primary/70 rounded-full" style={{ width: `${Math.min(100, t.allocationPercent)}%` }} />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    You track {t.tracked} {t.theme} stocks, but only hold {t.held}.
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actionable Insights */}
          <div className="space-y-4">
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <h4 className="text-sm font-700 text-red-400 mb-1">Impulsive Buys ({portfolioIntelligence.impulsive.length})</h4>
              <p className="text-xs text-muted-foreground mb-2">Stocks in your portfolio that were never researched in your Watchlist.</p>
              <div className="flex flex-wrap gap-1.5">
                {portfolioIntelligence.impulsive.slice(0, 8).map(s => (
                  <Badge key={s.ticker} variant="outline" className="text-xs cursor-pointer hover:bg-white/10" onClick={() => router.push(`/stock/${s.ticker}`)}>
                    {s.ticker}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <h4 className="text-sm font-700 text-green-400 mb-1">High Conviction, Not Bought ({portfolioIntelligence.convictionButNotBought.length})</h4>
              <p className="text-xs text-muted-foreground mb-2">Stocks you rated highly (&gt;7) but don't own.</p>
              <div className="flex flex-wrap gap-1.5">
                {portfolioIntelligence.convictionButNotBought.slice(0, 8).map(s => (
                  <Badge key={s.ticker} variant="outline" className="text-xs cursor-pointer hover:bg-white/10 text-green-300" onClick={() => router.push(`/stock/${s.ticker}`)}>
                    {s.ticker}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Portfolio Today', value: avgPortfolioToday },
          { label: 'Avg 1 Month Return', value: avg1M },
          { label: 'Avg 1 Year Return', value: avg1Y },
        ].map(card => (
          <div key={card.label} className="glass-card p-5 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{card.label}</div>
            <div className={`text-3xl font-800 tabular-nums ${getChangeColor(card.value)}`}>
              {formatPercent(card.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Category Performance Bar Chart */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-600 text-muted-foreground uppercase tracking-wider mb-5">
          Category Performance (Avg 1-Year Return)
        </h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryPerf} margin={{ top: 4, right: 8, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" horizontal vertical={false} />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 10, fill: 'oklch(0.55 0.01 264)' }}
                axisLine={false}
                tickLine={false}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tickFormatter={v => `${v}%`}
                tick={{ fontSize: 10, fill: 'oklch(0.55 0.01 264)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'oklch(1 0 0 / 3%)' }} />
              <Bar dataKey="avgGain1Y" name="Avg 1Y" radius={[4, 4, 0, 0]}>
                {categoryPerf.map((entry, i) => (
                  <Cell key={i} fill={getHeatmapColor(entry.avgGain1Y / 5)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Cards */}
      <div>
        <h2 className="text-sm font-600 text-muted-foreground uppercase tracking-wider mb-3">Category Breakdown</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {categoryPerf.map(cat => (
            <div key={cat.category} className="glass-card p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="text-sm font-600 text-foreground leading-tight">{cat.category}</div>
                <Badge variant="secondary" className="text-xs">{cat.count}</Badge>
              </div>
              <div className="space-y-1.5">
                {[
                  { label: 'Today', v: cat.avgChange },
                  { label: '1M', v: cat.avgGain1M },
                  { label: '1Y', v: cat.avgGain1Y },
                ].map(row => (
                  <div key={row.label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className={`font-600 tabular-nums ${getChangeColor(row.v)}`}>{formatPercent(row.v)}</span>
                  </div>
                ))}
              </div>
              {cat.topPerformer && (
                <div className="mt-2 pt-2 border-t border-white/8 text-xs">
                  <span className="text-muted-foreground">Best: </span>
                  <button
                    onClick={() => router.push(`/stock/${cat.topPerformer}`)}
                    className="text-gain font-600 hover:underline"
                  >
                    {cat.topPerformer}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Top Gainers / Losers by 1Y */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[
          { title: '🏆 Top 10 Gainers (1 Year)', items: gainers1Y, positive: true },
          { title: '📉 Top 10 Losers (1 Year)', items: losers1Y, positive: false },
        ].map(({ title, items, positive }) => (
          <div key={title} className="glass-card p-5">
            <h2 className="text-sm font-600 text-muted-foreground uppercase tracking-wider mb-4">{title}</h2>
            <div className="space-y-2">
              {items.map((s: MergedStock, i: number) => (
                <div
                  key={s.ticker}
                  onClick={() => router.push(`/stock/${s.ticker}`)}
                  className="flex items-center gap-3 cursor-pointer hover:bg-white/4 rounded-lg px-2 py-1.5 -mx-2 transition-colors group"
                >
                  <span className="text-xs text-muted-foreground/60 w-5 text-right font-600">{i + 1}</span>
                  <span className="text-sm font-700 group-hover:text-primary transition-colors w-14">{s.ticker}</span>
                  <span className="text-xs text-muted-foreground flex-1 truncate">{s.live?.shortName || s.name}</span>
                  <div className="h-1.5 w-24 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${positive ? 'bg-gain/70' : 'bg-loss/70'}`}
                      style={{ width: `${Math.min(100, Math.abs(s.gain1Y ?? 0) / (positive ? gainers1Y[0]?.gain1Y ?? 100 : Math.abs(losers1Y[0]?.gain1Y ?? 100)) * 100)}%` }}
                    />
                  </div>
                  <span className={`text-sm font-700 tabular-nums w-20 text-right ${getChangeColor(s.gain1Y)}`}>
                    {formatPercent(s.gain1Y)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
