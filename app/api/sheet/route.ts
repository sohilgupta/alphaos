// app/api/sheet/route.ts
// Manual refresh trigger for the Google Sheet data

import { NextResponse } from 'next/server';
import { fetchAllSheetStocks, getAllCategories } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stocks = await fetchAllSheetStocks(true); // force refresh
    const categories = getAllCategories(stocks);
    return NextResponse.json({
      count: stocks.length,
      categories,
      stocks,
      lastSynced: Date.now(),
    });
  } catch (err) {
    console.error('GET /api/sheet error:', err);
    return NextResponse.json({ error: 'Failed to refresh sheet' }, { status: 500 });
  }
}
