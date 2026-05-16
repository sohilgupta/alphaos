// /api/cron/warm — periodic cache warmer
//
// Triggered by Vercel Cron (see vercel.json). Pulls fresh Yahoo quotes and
// sheet data into Upstash so user-facing requests hit a warm KV instead of
// waiting for Yahoo's 200-ticker fanout. Without this, every cold-start
// user request pays the full Yahoo cost.
//
// Security: Vercel automatically sets `Authorization: Bearer ${CRON_SECRET}`
// on cron-triggered requests. We verify that header so external callers
// can't trigger expensive fetches.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchAllSheetStocks, fetchPortfolioStocks } from '@/lib/google-sheets';
import { getIndianPortfolio, getIndianWatchlist } from '@/lib/fetchIndianStocks';
import { getBatchQuotes } from '@/lib/yahoo-finance';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Verify the cron secret if configured. In local dev (no CRON_SECRET set)
  // the endpoint is open — convenient for manual testing.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const started = Date.now();

  try {
    // Force-refresh both watchlists + owner portfolios (they all go into KV).
    // We always warm portfolio caches here even without an owner session —
    // the cron is an internal trigger, not user-scoped.
    const [usWatchlist, indianWatchlist, usPortfolio, indianPortfolio] = await Promise.all([
      fetchAllSheetStocks(true),
      getIndianWatchlist(true),
      fetchPortfolioStocks(true),
      getIndianPortfolio(true),
    ]);

    const tickers = new Set<string>([
      ...usWatchlist.map(s => s.ticker),
      ...indianWatchlist.map(s => s.ticker),
      ...usPortfolio.map(s => s.ticker),
      ...indianPortfolio.map(s => s.ticker),
    ]);

    // Warm quote cache for every known ticker. getBatchQuotes will skip ones
    // still fresh in KV and refresh the rest.
    const quotes = await getBatchQuotes(Array.from(tickers));

    return NextResponse.json({
      ok: true,
      tickers: tickers.size,
      quotes: quotes.size,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    console.error('GET /api/cron/warm error:', err);
    return NextResponse.json(
      { error: 'Cache warm failed', durationMs: Date.now() - started },
      { status: 500 },
    );
  }
}
