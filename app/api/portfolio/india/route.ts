import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { getIndianPortfolio } from '@/lib/fetchIndianStocks';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    await requireOwner(request);
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const holdings = await getIndianPortfolio(forceRefresh);
    return NextResponse.json({ holdings }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('GET /api/portfolio/india error:', error);
    return NextResponse.json({ error: 'Failed to fetch Indian portfolio' }, { status: 500 });
  }
}
