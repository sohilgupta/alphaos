'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, RefreshCw } from 'lucide-react';

interface MFRow {
  id: string;
  scheme_name: string;
  isin: string | null;
  units: number;
  nav: number | null;
  value: number | null;
  updated_at: string;
}

function formatINR(n: number | null) {
  if (n == null) return '—';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

async function fetchMF(forceRefresh = false) {
  const url = `/api/mutual-funds${forceRefresh ? '?refresh=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch mutual funds');
  return res.json();
}

export default function MutualFundsTable() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['mutual-funds'],
    queryFn: () => fetchMF(),
    staleTime: 9 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const funds: MFRow[] = data?.funds ?? [];
  const totalValue: number = data?.totalValue ?? 0;

  if (isError) {
    return (
      <div className="text-center py-12 text-sm text-red-400">
        Failed to load mutual funds. Is Supabase configured?
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary row */}
      {!isLoading && funds.length > 0 && (
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-muted-foreground">{funds.length} funds</span>
            <span className="mx-2 text-white/20">·</span>
            <span className="text-sm font-600 text-foreground">{formatINR(totalValue)} total</span>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-secondary/30 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && funds.length === 0 && (
        <div className="text-center py-16 text-sm text-muted-foreground">
          <TrendingUp className="w-8 h-8 mx-auto mb-3 opacity-30" />
          No mutual fund data. Upload a CAS PDF to import your holdings.
        </div>
      )}

      {!isLoading && funds.length > 0 && (
        <div className="space-y-2">
          {funds.map(fund => (
            <div
              key={fund.id}
              className="flex items-start justify-between gap-3 px-4 py-3.5 rounded-xl bg-secondary/30 border border-white/6 hover:border-white/12 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-500 text-foreground leading-snug truncate">
                  {fund.scheme_name}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  {fund.isin && <span className="font-mono">{fund.isin}</span>}
                  {fund.nav != null && (
                    <span>NAV {formatINR(fund.nav)}</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-600 text-foreground">{formatINR(fund.value)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {fund.units.toLocaleString('en-IN', { maximumFractionDigits: 3 })} units
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
