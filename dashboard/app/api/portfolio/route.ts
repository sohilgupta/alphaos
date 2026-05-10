import { NextResponse } from 'next/server';
import { fetchPortfolioStocks } from '@/lib/google-sheets';
import { requireOwner } from '@/lib/auth';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    await requireOwner(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const portfolio = await fetchPortfolioStocks(forceRefresh);
    return NextResponse.json({ holdings: portfolio }, { status: 200 });
  } catch (error) {
    console.error('GET /api/portfolio error:', error);
    return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 });
  }
}
