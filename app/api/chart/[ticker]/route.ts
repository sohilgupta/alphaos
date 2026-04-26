// app/api/chart/[ticker]/route.ts

import { NextResponse } from 'next/server';
import { getHistory } from '@/lib/yahoo-finance';

export const dynamic = 'force-dynamic';

type Period = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max';
const VALID_PERIODS: Period[] = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max'];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get('period') ?? '1y';
  const period: Period = VALID_PERIODS.includes(periodParam as Period)
    ? (periodParam as Period)
    : '1y';

  try {
    const data = await getHistory(ticker.toUpperCase(), period);
    return NextResponse.json({ ticker: ticker.toUpperCase(), period, data }, { status: 200 });
  } catch (err) {
    console.error(`GET /api/chart/${ticker} error:`, err);
    return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 });
  }
}
