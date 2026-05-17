'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Small loading indicator with elapsed-time counter. Renders nothing until
 * the elapsed time clears `minVisibleMs` so fast loads don't flash a spinner.
 *
 * Pair this with skeleton bars: the bars show the layout, the indicator
 * tells the user "yes the page is still loading and you've waited Xs".
 */
export function LoadingIndicator({
  label = 'Loading',
  minVisibleMs = 200,
  className = '',
}: {
  label?: string;
  minVisibleMs?: number;
  className?: string;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 250); // 4 ticks/sec — feels live without spamming React renders
    return () => window.clearInterval(id);
  }, []);

  if (elapsedMs < minVisibleMs) return null;

  const seconds = Math.floor(elapsedMs / 1000);
  // Below 1s show "<1s" so the label isn't blank or "0s".
  const elapsedLabel = seconds < 1 ? '<1s' : `${seconds}s`;

  return (
    <div className={`inline-flex items-center gap-2 text-xs text-muted-foreground ${className}`}>
      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      <span>{label}…</span>
      <span className="tabular-nums opacity-70">{elapsedLabel}</span>
    </div>
  );
}
