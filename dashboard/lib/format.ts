// lib/format.ts
// Formatting utilities

/**
 * Strip exchange suffixes from a ticker for display. The underlying ticker
 * (`stock.ticker`) is preserved everywhere internally — only what the user
 * sees is shortened. `RELIANCE.NS` → `RELIANCE`, `500570.BO` → `500570`.
 */
export function formatTicker(ticker: string | null | undefined): string {
  if (!ticker) return '';
  return ticker.replace(/\.(NS|BO|NSE|BSE)$/i, '');
}

export function formatPrice(price: number | null | undefined, currency = 'USD'): string {
  if (price == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export function formatStockPrice(price: number | null | undefined, region?: 'US' | 'INDIA'): string {
  return formatPrice(price, region === 'INDIA' ? 'INR' : 'USD');
}

export function formatPercent(val: number | null | undefined, decimals = 2): string {
  if (val == null) return '—';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(decimals)}%`;
}

export function formatMarketCap(cap: number | null | undefined): string {
  if (cap == null) return '—';
  // If it's in billions (from sheet)
  if (cap < 10000) {
    if (cap >= 1000) return `$${(cap / 1000).toFixed(2)}T`;
    return `$${cap.toFixed(2)}B`;
  }
  // If it's in raw dollars (from Yahoo Finance)
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
  return `$${cap.toLocaleString()}`;
}

export function formatVolume(vol: number | null | undefined): string {
  if (vol == null) return '—';
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(2)}K`;
  return vol.toString();
}

export function formatLargeNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toLocaleString();
}

export function formatDate(ts: number | string): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function getChangeColor(val: number | null | undefined): string {
  if (val == null) return 'text-muted-foreground';
  if (val > 0) return 'text-gain';
  if (val < 0) return 'text-loss';
  return 'text-muted-foreground';
}

export function getChangeBg(val: number | null | undefined): string {
  if (val == null) return '';
  if (val > 0) return 'bg-gain/10 text-gain';
  if (val < 0) return 'bg-loss/10 text-loss';
  return 'bg-muted text-muted-foreground';
}

export function getHeatmapColor(val: number | null): string {
  if (val == null) return 'oklch(0.16 0.006 264)';
  const clamped = Math.max(-15, Math.min(15, val));
  if (clamped > 0) {
    const intensity = clamped / 15;
    return `oklch(${0.35 + intensity * 0.37} ${0.1 + intensity * 0.09} 155)`;
  } else {
    const intensity = Math.abs(clamped) / 15;
    return `oklch(${0.35 + intensity * 0.33} ${0.1 + intensity * 0.12} 27)`;
  }
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
}
