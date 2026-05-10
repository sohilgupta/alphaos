import { NextResponse } from 'next/server';
import { fetchAllSheetStocks } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const watchlist = await fetchAllSheetStocks(forceRefresh);
    return NextResponse.json({ stocks: watchlist }, { status: 200 });
  } catch (error) {
    console.error('GET /api/watchlist error:', error);
    return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 });
  }
}
