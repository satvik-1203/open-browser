import { logger } from "@repo/logger";

/**
 * In-process cache of context snapshot bytes, keyed by storage key.
 *
 * Safe to cache without any invalidation, and that is a property of the key
 * scheme rather than an assumption: a snapshot key embeds its version
 * (`contexts/<id>/<version>.json.gz`) and is never overwritten in place — a save
 * writes a *new* key and the context row's pointer flips afterwards. So a given
 * key's bytes are immutable for as long as the object exists. A new version is
 * a new key, which simply misses.
 *
 * Cached compressed rather than parsed. Compressed keeps the memory bound
 * meaningful (entries are bounded by the same limit that bounds a snapshot),
 * and re-parsing per read hands every session its own object graph — a shared
 * one would let a session that mutates its base corrupt the next session's.
 * For a typical profile that costs well under a millisecond against the ~250ms
 * storage round trip it replaces.
 */

/** Total cached bytes to hold. Compressed, so this is a lot of profiles. */
const MAX_CACHE_BYTES = Number(
  process.env.CONTEXT_CACHE_BYTES ?? 64 * 1024 * 1024,
);

/** Insertion-ordered, so the oldest key is the first one `keys()` yields. */
const entries = new Map<string, Buffer>();
let totalBytes = 0;

export function getCachedSnapshot(key: string): Buffer | undefined {
  const hit = entries.get(key);
  if (!hit) return undefined;
  // Refresh recency: delete + re-set moves it to the end of the iteration
  // order, so eviction below drops the least recently *used*, not the oldest.
  entries.delete(key);
  entries.set(key, hit);
  return hit;
}

export function cacheSnapshot(key: string, body: Buffer): void {
  if (body.byteLength > MAX_CACHE_BYTES) return;

  const existing = entries.get(key);
  if (existing) totalBytes -= existing.byteLength;
  entries.set(key, body);
  totalBytes += body.byteLength;

  while (totalBytes > MAX_CACHE_BYTES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    const evicted = entries.get(oldest);
    entries.delete(oldest);
    totalBytes -= evicted?.byteLength ?? 0;
    logger.debug("context snapshot evicted from cache", { key: oldest });
  }
}

export function snapshotCacheStats(): { entries: number; bytes: number } {
  return { entries: entries.size, bytes: totalBytes };
}
