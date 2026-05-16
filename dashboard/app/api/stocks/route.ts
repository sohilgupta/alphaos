import { NextResponse } from 'next/server';
import { fetchAllSheetStocks, fetchPortfolioStocks } from '@/lib/google-sheets';
import { getIndianPortfolio, getIndianWatchlist } from '@/lib/fetchIndianStocks';
import { getBatchQuotes, getBatchHistoricalReturns } from '@/lib/yahoo-finance';
import { MergedStock } from '@/lib/types';
import { getUser } from '@/lib/auth';
import { mergeIndianData, mergeUSData } from '@/lib/merge-stocks';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60; // seconds (respected on Vercel Pro/Enterprise)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const user = await getUser(request);
    const isOwner = user?.role === 'owner';

    const [usWatchlist, indianWatchlist, usPortfolio, indianPortfolio] = await Promise.all([
      fetchAllSheetStocks(forceRefresh),
      getIndianWatchlist(forceRefresh),
      isOwner ? fetchPortfolioStocks(forceRefresh) : Promise.resolve([]),
      isOwner ? getIndianPortfolio(forceRefresh) : Promise.resolve([]),
    ]);

    const tickers = new Set<string>([
      ...usWatchlist.map((stock) => stock.ticker),
      ...indianWatchlist.map((stock) => stock.ticker),
      ...(isOwner ? usPortfolio.map((stock) => stock.ticker) : []),
      ...(isOwner ? indianPortfolio.map((stock) => stock.ticker) : []),
    ]);

    const liveQuotes = await getBatchQuotes(Array.from(tickers));

    // Build a watchlist data map for quick field-presence checks
    const watchlistDataMap = new Map([
      ...usWatchlist.map(s => [s.ticker, s] as const),
      ...indianWatchlist.map(s => [s.ticker, s] as const),
    ]);

    // Fetch historical returns for every ticker that has a live price but is missing
    // gain6M (shown as 3M) or gain1Y — covers portfolio-only stocks AND watchlist stocks
    // where the sheet doesn't have those columns filled.
    // Portfolio stocks are sorted first so they're prioritised if we hit the cap.
    const portfolioTickers = new Set([
      ...(isOwner ? usPortfolio.map(s => s.ticker) : []),
      ...(isOwner ? indianPortfolio.map(s => s.ticker) : []),
    ]);

    // Portfolio stocks: ALWAYS fetch history (no cap) — these are the ones the
    // user cares most about seeing returns for.
    const portfolioNeedingHistory = Array.from(portfolioTickers).filter(
      ticker => liveQuotes.get(ticker)?.price
    );

    // Watchlist-only stocks missing sheet returns: fetch up to 25 to fill gaps
    // without blowing the function time budget.
    const watchlistNeedingHistory = Array.from(tickers)
      .filter(ticker => {
        if (portfolioTickers.has(ticker)) return false; // already covered above
        if (!liveQuotes.get(ticker)?.price) return false;
        const w = watchlistDataMap.get(ticker);
        return !w || w.gain6M == null || w.gain1Y == null;
      })
      .slice(0, 25);

    const tickersNeedingHistory = [...portfolioNeedingHistory, ...watchlistNeedingHistory];

    const historicalMap = tickersNeedingHistory.length > 0
      ? await getBatchHistoricalReturns(tickersNeedingHistory, liveQuotes)
      : new Map();

    const usStocks = mergeUSData(usWatchlist, usPortfolio, liveQuotes, user, historicalMap);
    const indianStocks = mergeIndianData(indianWatchlist, indianPortfolio, liveQuotes, user, historicalMap);
    const merged: MergedStock[] = [...usStocks, ...indianStocks];

    const withLive = merged.filter(s => s.live?.price);
    const gainers = [...withLive].sort((a, b) => (b.live!.changePercent) - (a.live!.changePercent));
    const summary = {
      totalStocks: merged.length,
      totalWithLive: withLive.length,
      avgChange: withLive.length
        ? withLive.reduce((sum, s) => sum + (s.live?.changePercent ?? 0), 0) / withLive.length
        : 0,
      topGainer: gainers[0]?.ticker ?? null,
      topLoser: gainers[gainers.length - 1]?.ticker ?? null,
      lastUpdated: Date.now(),
    };

    return NextResponse.json({ stocks: merged, summary }, {
      status: 200,
      headers: {
        // Prevent mobile browsers and Vercel edge from serving stale responses.
        // Live stock data must always be fresh from the origin handler.
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('GET /api/stocks error:', err);
    return NextResponse.json({ error: 'Failed to fetch stocks' }, { status: 500 });
  }
}
