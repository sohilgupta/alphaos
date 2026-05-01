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

    // Fetch historical returns for portfolio-only stocks (not in any watchlist)
    const watchlistTickers = new Set([
      ...usWatchlist.map(s => s.ticker),
      ...indianWatchlist.map(s => s.ticker),
    ]);
    const portfolioOnlyTickers = [
      ...(isOwner ? usPortfolio.map(s => s.ticker) : []),
      ...(isOwner ? indianPortfolio.map(s => s.ticker) : []),
    ].filter(t => !watchlistTickers.has(t));

    const historicalMap = portfolioOnlyTickers.length > 0
      ? await getBatchHistoricalReturns(portfolioOnlyTickers, liveQuotes)
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

    return NextResponse.json({ stocks: merged, summary }, { status: 200 });
  } catch (err) {
    console.error('GET /api/stocks error:', err);
    return NextResponse.json({ error: 'Failed to fetch stocks' }, { status: 500 });
  }
}
