'use client';

import { useState, useMemo } from 'react';
import { getHeatmapColor, formatPercent, formatTicker } from '@/lib/format';
import { MergedStock } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface Props {
  stocks: MergedStock[];
}

export default function HeatmapView({ stocks }: Props) {
  const router = useRouter();
  const [metric, setMetric] = useState<'changePercent' | 'gain1M' | 'gain1Y'>('changePercent');

  const metricLabel = {
    changePercent: 'Today',
    gain1M: '1 Month',
    gain1Y: '1 Year',
  };

  const items = useMemo(() =>
    stocks
      .map(s => ({
        ticker: s.ticker,
        name: s.live?.shortName || s.name,
        value: metric === 'changePercent'
          ? s.live?.changePercent ?? null
          : metric === 'gain1M'
            ? s.gain1M
            : s.gain1Y,
        price: s.live?.price ?? s.currentPriceSheet ?? null,
        category: s.category,
      }))
      .filter(s => s.value !== null)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    [stocks, metric]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(['changePercent', 'gain1M', 'gain1Y'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={`px-3 py-1 rounded-md text-xs font-500 transition-colors ${
              metric === m
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            {metricLabel[m]}
          </button>
        ))}
        {/* Legend */}
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-3 h-3 rounded-sm" style={{ background: getHeatmapColor(-10) }} />
          <span>Negative</span>
          <div className="w-3 h-3 rounded-sm" style={{ background: 'oklch(0.16 0.006 264)' }} />
          <span>Neutral</span>
          <div className="w-3 h-3 rounded-sm" style={{ background: getHeatmapColor(10) }} />
          <span>Positive</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <div
            key={item.ticker}
            onClick={() => router.push(`/stock/${item.ticker}`)}
            className="rounded-lg p-2.5 cursor-pointer hover:opacity-90 transition-opacity flex flex-col justify-between"
            style={{
              background: getHeatmapColor(item.value),
              minWidth: '70px',
              maxWidth: '110px',
              flex: '1 1 70px',
            }}
            title={`${item.name}: ${formatPercent(item.value)}`}
          >
            <div className="text-xs font-700 text-white/95">{formatTicker(item.ticker)}</div>
            <div className="text-xs font-600 text-white/80 mt-1">{formatPercent(item.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
