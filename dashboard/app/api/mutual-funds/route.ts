import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { db } from '@/lib/db/supabase';
import { getCache, setCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'mutual-funds:owner';
const CACHE_TTL = 10 * 60 * 1000; // 10 min

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
    const { data, error } = await db()
      .from('mutual_funds')
      .select('*')
      .eq('user_id', 'owner')
      .order('value', { ascending: false });

    if (error) throw error;

    const totalValue = (data ?? []).reduce((s, r) => s + (r.value ?? 0), 0);
    const payload = { funds: data ?? [], totalValue, count: (data ?? []).length };

    setCache(CACHE_KEY, payload, CACHE_TTL);
    return NextResponse.json(payload);
  } catch (err) {
    console.error('GET /api/mutual-funds error:', err);
    return NextResponse.json({ error: 'Failed to fetch mutual funds' }, { status: 500 });
  }
}
