import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { getIndianPortfolio } from '@/lib/fetchIndianStocks';
import { getBatchQuotes } from '@/lib/yahoo-finance';
import { db } from '@/lib/db/supabase';
import { getCache, setCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CACHE_KEY = 'portfolio:india:owner';
const CACHE_TTL = 10 * 60 * 1000; // 10 min

async function getCASHoldings() {
  try {
    const { data } = await db()
      .from('portfolio_holdings')
      .select('*')
      .eq('user_id', 'owner')
      .eq('source', 'cas')
      .not('ticker', 'is', null);
    return data ?? [];
  } catch {
    return []; // DB not configured yet
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireOwner(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const forceRefresh = new URL(request.url).searchParams.get('refresh') === 'true';

  if (!forceRefresh) {
    const cached = getCache(CACHE_KEY);
    if (cached) return NextResponse.json(cached);
  }

  try {
    // Prefer CAS data; fall back to Google Sheets
    const casHoldings = await getCASHoldings();
    const source = casHoldings.length > 0 ? 'cas' : 'sheets';

    let holdings: { ticker: string; name: string; quantity: number; avgBuyPrice: number; investedValue: number }[];

    if (source === 'cas') {
      holdings = casHoldings.map((h: any) => ({
        ticker: h.ticker,
        name: h.name,
        quantity: Number(h.quantity),
        avgBuyPrice: h.value && h.quantity ? Number(h.value) / Number(h.quantity) : 0,
        investedValue: Number(h.value) ?? 0,
      }));
    } else {
      holdings = await getIndianPortfolio(forceRefresh);
    }

    const tickers = holdings.map(h => h.ticker).filter(Boolean);
    const liveQuotes = await getBatchQuotes(tickers);

    const holdingsWithLive = holdings.map(holding => {
      const live = liveQuotes.get(holding.ticker);
      const currentPrice = live?.price ?? holding.avgBuyPrice;
      const currentValue = holding.quantity * currentPrice;
      const pnl = currentValue - holding.investedValue;
      const pnlPercent = holding.investedValue > 0 ? (pnl / holding.investedValue) * 100 : 0;

      return {
        ...holding,
        currentPrice,
        currentValue,
        pnl,
        pnlPercent,
        changePercent: live?.changePercent ?? null,
        source,
      };
    });

    const payload = { holdings: holdingsWithLive, source };
    setCache(CACHE_KEY, payload, CACHE_TTL);
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error('GET /api/portfolio/india error:', error);
    return NextResponse.json({ error: 'Failed to fetch Indian portfolio' }, { status: 500 });
  }
}
