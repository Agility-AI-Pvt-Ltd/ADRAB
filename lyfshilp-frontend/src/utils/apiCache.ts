/**
 * Client-side API cache — localStorage backed, TTL-aware, stale-while-revalidate.
 *
 * Usage:
 *   const data = await cachedFetch('my_key', () => api.getSomething(), { ttl: 5 * 60_000 });
 *
 *   // Invalidate after a mutation:
 *   invalidateCache('my_key');
 */

const PREFIX = 'lyfshilp_cache_';

interface CacheEntry<T> {
  data: T;
  storedAt: number; // epoch ms
}

function cacheKey(key: string): string {
  return PREFIX + key;
}

export function readCache<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(cacheKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, storedAt: Date.now() };
    localStorage.setItem(cacheKey(key), JSON.stringify(entry));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function invalidateCache(...keys: string[]): void {
  for (const key of keys) {
    try {
      localStorage.removeItem(cacheKey(key));
    } catch {
      // ignore
    }
  }
}

/**
 * Stale-while-revalidate fetch.
 *
 * 1. If a fresh (within TTL) cache entry exists → return it immediately, skip network.
 * 2. If a stale cache entry exists → return it immediately AND trigger a background refresh.
 * 3. If no cache entry exists → fetch, cache, and return.
 *
 * @param key     Cache key
 * @param fetcher Async function that calls the API
 * @param options
 *   ttl          Fresh TTL in ms (default 5 min). Within TTL → no network call.
 *   staleTtl     How long a stale entry is still usable (default 30 min).
 *   onRefresh    Called when a background refresh completes with fresh data.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: {
    ttl?: number;
    staleTtl?: number;
    onRefresh?: (fresh: T) => void;
  } = {}
): Promise<T> {
  const ttl = options.ttl ?? 5 * 60_000;         // 5 min fresh window
  const staleTtl = options.staleTtl ?? 30 * 60_000; // 30 min stale window

  const entry = readCache<T>(key);
  const now = Date.now();

  if (entry) {
    const age = now - entry.storedAt;

    if (age < ttl) {
      // ✅ Fresh — return immediately, no network call
      return entry.data;
    }

    if (age < staleTtl) {
      // ⚠️ Stale — return immediately AND refresh in background
      refreshInBackground(key, fetcher, options.onRefresh);
      return entry.data;
    }
  }

  // ❌ No cache or expired — fetch synchronously
  const data = await fetcher();
  writeCache(key, data);
  return data;
}

function refreshInBackground<T>(
  key: string,
  fetcher: () => Promise<T>,
  onRefresh?: (fresh: T) => void
): void {
  fetcher()
    .then((data) => {
      writeCache(key, data);
      onRefresh?.(data);
    })
    .catch(() => {
      // Background refresh failed — silently keep stale data
    });
}
