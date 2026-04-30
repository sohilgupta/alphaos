type CacheEntry = {
  data: unknown;
  expiry: number;
};

const store: Record<string, CacheEntry> = {};

export function getCache<T>(key: string): T | null {
  const entry = store[key];
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    delete store[key];
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttlMs: number): void {
  store[key] = { data, expiry: Date.now() + ttlMs };
}

export function deleteCache(key: string): void {
  delete store[key];
}

export function deleteCacheByPrefix(prefix: string): void {
  for (const key of Object.keys(store)) {
    if (key.startsWith(prefix)) delete store[key];
  }
}
