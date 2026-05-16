// lib/cache.ts
// Persistent KV cache (Upstash Redis) with graceful in-memory fallback.
//
// Why this exists:
//   Vercel serverless functions are stateless. An in-memory cache resets on
//   every cold start, which means our 5-min Yahoo TTL never actually hits
//   in production — every cold instance re-fetches all ~250 quotes from
//   Yahoo. With Upstash Redis the cache survives cold starts, so real hit
//   rate jumps from ~0% to ~95%, and `/api/stocks` p99 drops from "wait for
//   Yahoo" to a single KV read.
//
// Setup:
//   Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in env. Without
//   them, the cache silently falls back to a per-process in-memory dict —
//   useful for local dev and as a safety net if Upstash is unreachable.

import { Redis } from '@upstash/redis';

type Entry<T> = { data: T; expiry: number };
const memoryStore: Record<string, Entry<unknown>> = {};

// Lazy singleton — only construct if creds are present. Reused across calls
// in the same serverless instance (Upstash REST client has no socket).
let redisClient: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisClient = null;
    return null;
  }
  try {
    redisClient = new Redis({ url, token });
  } catch (err) {
    console.warn('[cache] failed to construct Redis client, falling back to memory:', err);
    redisClient = null;
  }
  return redisClient;
}

export async function getCache<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const val = await redis.get<T>(key);
      return val ?? null;
    } catch (err) {
      console.warn(`[cache] redis get failed for ${key}, falling back to memory:`, err);
    }
  }
  const entry = memoryStore[key];
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    delete memoryStore[key];
    return null;
  }
  return entry.data as T;
}

export async function setCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      // Upstash takes seconds; minimum 1s to avoid no-op writes for sub-second TTLs.
      const ex = Math.max(1, Math.ceil(ttlMs / 1000));
      await redis.set(key, data, { ex });
      return;
    } catch (err) {
      console.warn(`[cache] redis set failed for ${key}, writing to memory:`, err);
    }
  }
  memoryStore[key] = { data, expiry: Date.now() + ttlMs };
}

export async function deleteCache(key: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(key);
    } catch (err) {
      console.warn(`[cache] redis del failed for ${key}:`, err);
    }
  }
  delete memoryStore[key];
}

export async function deleteCacheByPrefix(prefix: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      // Use SCAN to enumerate, then DEL in batches. Avoids KEYS which blocks.
      let cursor: string | number = 0;
      do {
        const result: [string | number, string[]] = await redis.scan(cursor, { match: `${prefix}*`, count: 100 });
        cursor = result[0];
        const keys = result[1];
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== 0 && cursor !== '0');
    } catch (err) {
      console.warn(`[cache] redis scan/del failed for prefix ${prefix}:`, err);
    }
  }
  for (const key of Object.keys(memoryStore)) {
    if (key.startsWith(prefix)) delete memoryStore[key];
  }
}
