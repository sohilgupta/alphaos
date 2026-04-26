// app/api/stock/[ticker]/route.ts

import { NextResponse } from 'next/server';
import { getStockDetail } from '@/lib/yahoo-finance';
import { fetchAllSheetStocks, fetchPortfolioStocks } from '@/lib/google-sheets';
import { suggestTheme } from '@/lib/intelligence';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  try {
    const [detail, sheetStocks, portfolioStocks] = await Promise.all([
      getStockDetail(upperTicker),
      fetchAllSheetStocks(),
      fetchPortfolioStocks(),
    ]);

    const sheetData = sheetStocks.find(s => s.ticker === upperTicker) ?? null;
    const portfolioData = portfolioStocks.find(s => s.ticker === upperTicker) ?? null;
    
    // Intelligence theme using full detail if available
    const name = sheetData?.name || portfolioData?.name || detail?.shortName || upperTicker;
    const suggestion = detail 
      ? suggestTheme({ name, description: detail.description ?? sheetData?.description ?? '', sector: detail.sector ?? '', industry: detail.industry ?? '' })
      : suggestTheme({ name, description: sheetData?.description ?? '' });

    return NextResponse.json({ detail, sheetData, portfolioData, suggestion }, { status: 200 });
  } catch (err) {
    console.error(`GET /api/stock/${upperTicker} error:`, err);
    return NextResponse.json({ error: 'Failed to fetch stock detail' }, { status: 500 });
  }
}
