'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { formatPrice, formatDate } from '@/lib/format';

interface Props {
  ticker: string;
}

const PERIODS = [
  { label: '1D', value: '1d' },
  { label: '5D', value: '5d' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: '2Y', value: '2y' },
  { label: '5Y', value: '5y' },
  { label: 'MAX', value: 'max' },
];

async function fetchChart(ticker: string, period: string) {
  const res = await fetch(`/api/chart/${ticker}?period=${period}`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

export default function PriceChart({ ticker }: Props) {
  const [period, setPeriod] = useState('1y');

  const { data, isLoading } = useQuery({
    queryKey: ['chart', ticker, period],
    queryFn: () => fetchChart(ticker, period),
  });

  const points = data?.data ?? [];
  const firstClose = points[0]?.close ?? 0;
  const lastClose = points[points.length - 1]?.close ?? 0;
  const isPositive = lastClose >= firstClose;
  const chartColor = isPositive ? 'oklch(0.72 0.19 155)' : 'oklch(0.68 0.22 27)';

  const formatted = points.map((p: { date: string; close: number }) => ({
    date: p.date,
    close: p.close,
    label: formatDate(p.date),
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const val = payload[0]?.value;
    return (
      <div className="glass px-3 py-2 rounded-lg text-xs">
        <div className="text-muted-foreground mb-0.5">{formatDate(label)}</div>
        <div className="font-700 text-foreground">{formatPrice(val)}</div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Period Selector */}
      <div className="flex items-center gap-1">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-2.5 py-1 rounded-md text-xs font-600 transition-colors ${
              period === p.value
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-64 w-full">
        {isLoading ? (
          <div className="h-full w-full skeleton rounded-xl" />
        ) : formatted.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
            No chart data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formatted} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={v => formatDate(v)}
                tick={{ fontSize: 10, fill: 'oklch(0.55 0.01 264)' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={v => `$${v.toFixed(0)}`}
                tick={{ fontSize: 10, fill: 'oklch(0.55 0.01 264)' }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'oklch(1 0 0 / 20%)', strokeWidth: 1 }} />
              {firstClose > 0 && (
                <ReferenceLine
                  y={firstClose}
                  stroke="oklch(1 0 0 / 20%)"
                  strokeDasharray="4 4"
                />
              )}
              <Area
                type="monotone"
                dataKey="close"
                stroke={chartColor}
                strokeWidth={2}
                fill={`url(#grad-${ticker})`}
                dot={false}
                activeDot={{ r: 4, fill: chartColor, stroke: 'oklch(0.08 0.005 264)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
