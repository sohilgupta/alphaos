// /api/prices — fast quotes-only endpoint
//
// Separates frequently-updating data (live prices, 30-60s TTL) from
// slowly-updating data (sheet metadata, verdicts, 5-10 min TTL). Frontend
// can poll this independently from /api/stocks to stream price updates
// without paying for a sheet re-parse on every refresh.
//
// Source of tickers: reads the cached watchlists. If the watchlist caches
// are empty, returns an empty quote map and the caller falls back to
// /api/stocks (cold-start path).

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchAllSheetStocks, fetchPortfolioStocks } from '@/lib/google-sheets';
import { getIndianPortfolio, getIndianWatchlist } from '@/lib/fetchIndianStocks';
import { getBatchQuotes } from '@/lib/yahoo-finance';
import { getUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    // Ping mode for external cron warmers — see /api/stocks for rationale.
    const { searchParams } = new URL(request.url);
    if (searchParams.get('ping') === '1') {
      return NextResponse.json(
        { ok: true, ts: Date.now() },
        { status: 200, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const user = await getUser(request);
    const isOwner = user?.role === 'owner';

    // Use whatever the watchlist/portfolio caches already have. We deliberately
    // don't force-refresh sheets here — that's the job of /api/stocks. This
    // endpoint is hot-path for prices only.
    const [usWatchlist, indianWatchlist, usPortfolio, indianPortfolio] = await Promise.all([
      fetchAllSheetStocks(false),
      getIndianWatchlist(false),
      isOwner ? fetchPortfolioStocks(false) : Promise.resolve([]),
      isOwner ? getIndianPortfolio(false) : Promise.resolve([]),
    ]);

    const tickers = new Set<string>([
      ...usWatchlist.map(s => s.ticker),
      ...indianWatchlist.map(s => s.ticker),
      ...(isOwner ? usPortfolio.map(s => s.ticker) : []),
      ...(isOwner ? indianPortfolio.map(s => s.ticker) : []),
    ]);

    const liveQuotes = await getBatchQuotes(Array.from(tickers));

    // Compact payload — just ticker → price + change + changePercent. Anything
    // richer is in /api/stocks. This stays under ~30KB for ~400 tickers.
    const prices: Record<string, { p: number; c: number; cp: number; t: number }> = {};
    for (const [ticker, q] of liveQuotes) {
      prices[ticker] = {
        p: q.price,
        c: q.change,
        cp: q.changePercent,
        t: q.fetchedAt,
      };
    }

    return NextResponse.json(
      { prices, count: Object.keys(prices).length, generatedAt: Date.now() },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'CDN-Cache-Control': 'no-store',
          'Vercel-CDN-Cache-Control': 'no-store',
        },
      },
    );
  } catch (err) {
    console.error('GET /api/prices error:', err);
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}
