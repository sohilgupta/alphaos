// /api/diag/cache — verify Upstash KV wiring end-to-end in one HTTP call.
//
// Tells you:
//   1. Whether the env vars are visible to the running function
//   2. Whether a real SET roundtrips through Upstash
//   3. Whether the cron secret env var is present (not its value)
//
// Safe to expose unauthenticated — only reports env-var presence, never
// values, and the test key is namespaced + auto-expires in 30s.

import { NextResponse } from 'next/server';
import { getCache, setCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const env = {
    UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    CRON_SECRET: !!process.env.CRON_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV ?? null,
  };

  // Roundtrip test: write a tiny payload and read it back. If Upstash is
  // wired correctly we get the same object back. If env vars are wrong /
  // missing, we fall back to per-process in-memory and the read will
  // succeed BUT a follow-up call to /api/diag/cache won't see the
  // previous write (different serverless instance).
  const key = 'diag:roundtrip';
  const value = { ts: Date.now(), instance: Math.random().toString(36).slice(2, 8) };

  let writeOk = false;
  let writeError: string | null = null;
  try {
    await setCache(key, value, 30_000);
    writeOk = true;
  } catch (e) {
    writeError = e instanceof Error ? e.message : String(e);
  }

  let read: unknown = null;
  let readError: string | null = null;
  try {
    read = await getCache(key);
  } catch (e) {
    readError = e instanceof Error ? e.message : String(e);
  }

  // If env vars are present AND we wrote AND we read back the SAME value
  // we just wrote → Upstash is fully wired.
  const wrote = value;
  const roundtripOk =
    env.UPSTASH_REDIS_REST_URL &&
    env.UPSTASH_REDIS_REST_TOKEN &&
    writeOk &&
    read != null &&
    typeof read === 'object' &&
    (read as { instance?: string }).instance === value.instance;

  return NextResponse.json(
    { env, writeOk, writeError, read, readError, wrote, roundtripOk },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
