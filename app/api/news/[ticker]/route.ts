// app/api/news/[ticker]/route.ts

import { NextResponse } from 'next/server';
import { getNews } from '@/lib/yahoo-finance';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const news = await getNews(ticker.toUpperCase());
    return NextResponse.json({ news }, { status: 200 });
  } catch (err) {
    console.error(`GET /api/news/${ticker} error:`, err);
    return NextResponse.json({ news: [] }, { status: 200 });
  }
}
