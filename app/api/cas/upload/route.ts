import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { parseCASPdf } from '@/lib/cas/parser';
import { normalizeEquities, normalizeMutualFunds } from '@/lib/cas/normalize';
import { mapBatch } from '@/lib/cas/ticker-map';
import { db } from '@/lib/db/supabase';
import type { DBPortfolioHolding, DBMutualFund } from '@/lib/cas/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(request: NextRequest) {
  try {
    await requireOwner(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  const password = (formData.get('password') as string | null) ?? '';

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });
  }
  if (!file.type.includes('pdf') && !file.name?.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'File too large (max 15 MB)' }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseCASPdf(buffer, password);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('password')) {
      return NextResponse.json({ error: 'Invalid PDF password' }, { status: 422 });
    }
    console.error('CAS parse error:', msg);
    return NextResponse.json({ error: 'Failed to parse CAS PDF' }, { status: 500 });
  }

  const equities = normalizeEquities(parsed.equities);
  const mutualFunds = normalizeMutualFunds(parsed.mutualFunds);

  // Map ISINs to tickers — skip ISINs that already have a ticker from NSDL parsing
  const isinsNeedingLookup = equities.filter(e => !e.ticker).map(e => e.isin);
  const tickerMap = await mapBatch(isinsNeedingLookup);

  const unmapped: string[] = [];
  const holdings: DBPortfolioHolding[] = equities.map(e => {
    const ticker = e.ticker ?? tickerMap.get(e.isin) ?? null;
    if (!ticker) unmapped.push(e.isin);
    return {
      user_id: 'owner',
      isin: e.isin,
      ticker,
      name: e.name,
      quantity: e.quantity,
      value: e.value || null,
      source: 'cas' as const,
    };
  });

  if (unmapped.length) {
    console.warn('CAS: unmapped ISINs:', unmapped.join(', '));
  }

  const mfRows: DBMutualFund[] = mutualFunds.map(f => ({
    user_id: 'owner',
    isin: f.isin,
    scheme_name: f.schemeName,
    units: f.units,
    nav: f.nav,
    value: f.value || null,
  }));

  try {
    const supabase = db();
    const now = new Date().toISOString();

    // Upsert — replace previous CAS data for this user atomically
    await supabase
      .from('portfolio_holdings')
      .delete()
      .eq('user_id', 'owner')
      .eq('source', 'cas');

    if (holdings.length) {
      await supabase
        .from('portfolio_holdings')
        .insert(holdings.map(h => ({ ...h, updated_at: now })));
    }

    await supabase
      .from('mutual_funds')
      .delete()
      .eq('user_id', 'owner');

    if (mfRows.length) {
      await supabase
        .from('mutual_funds')
        .insert(mfRows.map(r => ({ ...r, updated_at: now })));
    }
  } catch (err) {
    console.error('CAS DB error:', err);
    return NextResponse.json({ error: 'Failed to store CAS data' }, { status: 500 });
  }

  return NextResponse.json({
    stocksParsed: holdings.length,
    mutualFundsParsed: mfRows.length,
    unmappedIsins: unmapped.length,
    statementDate: parsed.statementDate,
    updatedAt: new Date().toISOString(),
  });
}
