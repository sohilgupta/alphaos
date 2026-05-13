import { NextResponse, type NextRequest } from 'next/server';
import { getUser } from '@/lib/auth';
import { getNsdlData } from '@/lib/nsdl';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // Owner-only — this exposes personal net worth, not for public viewing.
  const user = await getUser(request);
  if (user?.role !== 'owner') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('refresh') === 'true';
    const data = await getNsdlData(force);
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('GET /api/nsdl error:', msg);
    return NextResponse.json({ error: 'Failed to fetch NSDL data', detail: msg }, { status: 500 });
  }
}
