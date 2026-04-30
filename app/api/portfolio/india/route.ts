import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { getIndianPortfolio } from '@/lib/fetchIndianStocks';
import { getBatchQuotes } from '@/lib/yahoo-finance';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    await requireOwner(request);
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const holdings = await getIndianPortfolio(forceRefresh);

    // Get live quotes for portfolio holdings
    const tickers = holdings.map(h => h.ticker);
    const liveQuotes = await getBatchQuotes(tickers);

    // Merge live data with holdings
    const holdingsWithLive = holdings.map(holding => {
      const live = liveQuotes.get(holding.ticker);
      const currentPrice = live?.price ?? holding.avgBuyPrice;
      const currentValue = holding.quantity * currentPrice;
      const pnl = currentValue - holding.investedValue;
      const pnlPercent = (pnl / holding.investedValue) * 100;

      return {
        ...holding,
        currentPrice,
        currentValue,
        pnl,
        pnlPercent,
        changePercent: live?.changePercent,
      };
    });

    return NextResponse.json({ holdings: holdingsWithLive }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('GET /api/portfolio/india error:', error);
    return NextResponse.json({ error: 'Failed to fetch Indian portfolio' }, { status: 500 });
  }
}
