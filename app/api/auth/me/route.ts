import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  const isOwner = await isAuthenticated();
  return NextResponse.json({ role: isOwner ? 'owner' : 'public' });
}
