'use client';

import { useState, useMemo } from 'react';
import { getReturnHeatClass, formatPercent, formatTicker, displayName, type HeatTf } from '@/lib/format';
import { MergedStock } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface Props {
  stocks: MergedStock[];
}

export default function HeatmapView({ stocks }: Props) {
  const router = useRouter();
  const [metric, setMetric] = useState<'changePercent' | 'gain1M' | 'gain1Y'>('changePercent');

  const metricLabel: Record<typeof metric, string> = {
    changePercent: 'Today',
    gain1M: '1 Month',
    gain1Y: '1 Year',
  };

  const metricTf: Record<typeof metric, HeatTf> = {
    changePercent: '1D',
    gain1M: '1M',
    gain1Y: '1Y',
  };
  const tf = metricTf[metric];

  const items = useMemo(() =>
    stocks
      .map(s => {
        // Pick a compact tile label:
        //   - If the cleaned ticker is a meaningful symbol (has letters),
        //     use it (MXL, GPUS — most readable in a tiny tile).
        //   - If the ticker is a numeric BSE/NSE code (531489, 532467),
        //     fall back to the company name truncated — a code in the
        //     heatmap conveys nothing.
        const cleanTicker = formatTicker(s.ticker);
        const tickerHasLetters = /[a-zA-Z]/.test(cleanTicker);
        const fullName = displayName({ sheetName: s.name, liveShortName: s.live?.shortName, liveLongName: s.live?.longName, ticker: s.ticker });
        const tileLabel = tickerHasLetters ? cleanTicker : fullName;
        return {
          ticker: s.ticker,
          tileLabel,
          name: fullName,
          value: metric === 'changePercent'
            ? s.live?.changePercent ?? null
            : metric === 'gain1M'
              ? s.gain1M
              : s.gain1Y,
          price: s.live?.price ?? s.currentPriceSheet ?? null,
          category: s.category,
        };
      })
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
        {/* Legend — mirrors the 4-step heat scale used in StockTable */}
        <div className="ml-auto flex items-center gap-1 text-[10px] font-600 text-muted-foreground uppercase tracking-wider">
          <span className="mr-1">Less</span>
          <div className="heat-dn-4 w-4 h-3 rounded-sm" />
          <div className="heat-dn-3 w-4 h-3 rounded-sm" />
          <div className="heat-dn-2 w-4 h-3 rounded-sm" />
          <div className="heat-dn-1 w-4 h-3 rounded-sm" />
          <div className="heat-zero w-4 h-3 rounded-sm" />
          <div className="heat-up-1 w-4 h-3 rounded-sm" />
          <div className="heat-up-2 w-4 h-3 rounded-sm" />
          <div className="heat-up-3 w-4 h-3 rounded-sm" />
          <div className="heat-up-4 w-4 h-3 rounded-sm" />
          <span className="ml-1">More</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <div
            key={item.ticker}
            onClick={() => router.push(`/stock/${item.ticker}`)}
            className={`${getReturnHeatClass(item.value, tf)} rounded-lg p-2.5 cursor-pointer hover:brightness-110 transition flex flex-col justify-between overflow-hidden`}
            style={{ minWidth: '70px', maxWidth: '110px', flex: '1 1 70px' }}
            title={`${item.name}: ${formatPercent(item.value)}`}
          >
            <div className="text-xs font-700 truncate min-w-0">{item.tileLabel}</div>
            <div className="text-xs font-600 tabular-nums mt-1 opacity-90 truncate">{formatPercent(item.value, 1)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
