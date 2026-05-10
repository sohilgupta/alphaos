'use client';

import { StockDetail } from '@/lib/types';
import { formatMarketCap, formatPercent, formatLargeNumber } from '@/lib/format';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface Props {
  detail: StockDetail;
}

interface StatItem {
  label: string;
  value: string;
  hint?: string;
  colored?: boolean;
  raw?: number | null;
}

export default function KeyStats({ detail }: Props) {
  const pct = (v: number | null) => v != null ? `${(v * 100).toFixed(1)}%` : '—';
  const num = (v: number | null) => v != null ? v.toFixed(2) : '—';

  const stats: StatItem[] = [
    {
      label: 'Market Cap',
      value: formatMarketCap(detail.marketCap),
      hint: 'Total market value of all outstanding shares',
    },
    {
      label: 'P/E Ratio',
      value: detail.pe != null ? detail.pe.toFixed(1) : '—',
      hint: 'Price-to-earnings ratio (trailing)',
    },
    {
      label: 'EPS',
      value: detail.eps != null ? `$${detail.eps.toFixed(2)}` : '—',
      hint: 'Trailing twelve months earnings per share',
    },
    {
      label: 'Beta',
      value: detail.beta != null ? detail.beta.toFixed(2) : '—',
      hint: 'Volatility relative to S&P 500 (1.0 = market)',
    },
    {
      label: 'Revenue Growth',
      value: pct(detail.revenueGrowth),
      hint: 'Year-over-year revenue growth',
      colored: true,
      raw: detail.revenueGrowth,
    },
    {
      label: 'Gross Margin',
      value: pct(detail.grossMargin),
      hint: 'Gross profit as % of revenue',
    },
    {
      label: 'Operating Margin',
      value: pct(detail.operatingMargin),
      hint: 'Operating profit as % of revenue',
      colored: true,
      raw: detail.operatingMargin,
    },
    {
      label: 'Net Margin',
      value: pct(detail.netMargin),
      hint: 'Net profit as % of revenue',
      colored: true,
      raw: detail.netMargin,
    },
    {
      label: 'ROE',
      value: pct(detail.returnOnEquity),
      hint: 'Return on equity',
      colored: true,
      raw: detail.returnOnEquity,
    },
    {
      label: 'Debt/Equity',
      value: detail.debtToEquity != null ? detail.debtToEquity.toFixed(2) : '—',
      hint: 'Total debt divided by shareholders equity',
    },
    {
      label: 'Free Cash Flow',
      value: formatLargeNumber(detail.freeCashFlow),
      hint: 'Operating cash flow minus capex',
      colored: true,
      raw: detail.freeCashFlow,
    },
    {
      label: '52W High',
      value: detail.week52High != null ? `$${detail.week52High.toFixed(2)}` : '—',
      hint: '52-week highest price',
    },
    {
      label: '52W Low',
      value: detail.week52Low != null ? `$${detail.week52Low.toFixed(2)}` : '—',
      hint: '52-week lowest price',
    },
    {
      label: 'Volume',
      value: detail.volume != null ? formatLargeNumber(detail.volume) : '—',
      hint: 'Today\'s trading volume',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {stats.map(stat => (
        <div key={stat.label} className="glass-card p-3">
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-xs text-muted-foreground font-500">{stat.label}</span>
            {stat.hint && (
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-3 h-3 text-muted-foreground/50" />
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-48">{stat.hint}</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className={`text-base font-700 tabular-nums ${
            stat.colored && stat.raw != null
              ? stat.raw >= 0 ? 'text-gain' : 'text-loss'
              : 'text-foreground'
          }`}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
