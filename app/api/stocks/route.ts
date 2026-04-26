import { NextResponse } from 'next/server';
import { fetchAllSheetStocks, fetchPortfolioStocks } from '@/lib/google-sheets';
import { getBatchQuotes } from '@/lib/yahoo-finance';
import { suggestTheme } from '@/lib/intelligence';
import { MergedStock } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    // 1. Fetch both sheets concurrently
    const [sheetStocks, portfolioStocks] = await Promise.all([
      fetchAllSheetStocks(forceRefresh),
      fetchPortfolioStocks(forceRefresh),
    ]);

    // 2. Build Maps
    const watchlistMap = new Map(sheetStocks.map(s => [s.ticker, s]));
    const portfolioMap = new Map(portfolioStocks.map(s => [s.ticker, s]));

    // 3. Get unique tickers
    const allTickers = new Set([...watchlistMap.keys(), ...portfolioMap.keys()]);
    
    // 4. Fetch live quotes for all
    const liveQuotes = await getBatchQuotes(Array.from(allTickers));

    // 5. Merge logic (Full Outer Join)
    const merged: MergedStock[] = [];

    for (const ticker of allTickers) {
      const wData = watchlistMap.get(ticker);
      const pData = portfolioMap.get(ticker);
      const live = liveQuotes.get(ticker) ?? null;

      // Tags logic
      const isInWatchlist = !!wData;
      const isInPortfolio = !!pData;
      const tags: string[] = [];
      if (isInWatchlist && isInPortfolio) tags.push('WATCHLIST + PORTFOLIO');
      else if (isInWatchlist) tags.push('WATCHLIST ONLY');
      else if (isInPortfolio) tags.push('PORTFOLIO ONLY');

      // Intelligence Theme
      const name = wData?.name || pData?.name || live?.shortName || ticker;
      const description = wData?.description || '';
      const suggestion = suggestTheme({ name, description });

      merged.push({
        ticker,
        name,
        category: wData?.category || 'Uncategorized',
        sheetTab: wData?.sheetTab || 'Portfolio Only',
        description,
        marketCapSheet: wData?.marketCapSheet ?? null,
        currentPriceSheet: wData?.currentPriceSheet ?? null,
        fairPrice: wData?.fairPrice ?? null,
        potentialGain: wData?.potentialGain ?? null,
        gain1W: wData?.gain1W ?? null,
        gain1M: wData?.gain1M ?? null,
        gain6M: wData?.gain6M ?? null,
        gain1Y: wData?.gain1Y ?? null,
        gain3Y: wData?.gain3Y ?? null,
        live,
        convictionScore: 5, // default
        alertThreshold: null,
        tags,
        isInWatchlist,
        isInPortfolio,
        portfolioData: pData ? {
          quantity: pData.quantity,
          avgBuyPrice: pData.avgBuyPrice,
          investedValue: pData.investedValue
        } : undefined,
        originalTheme: wData?.category,
        suggestedTheme: suggestion?.theme,
        themeConfidence: suggestion?.confidence
      });
    }

    // 6. Build summary stats
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
