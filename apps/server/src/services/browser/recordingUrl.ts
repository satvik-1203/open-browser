import { getStorage, objectKey } from "@/services/storage/index";

/** Object key a session's recording is stored under. */
export function recordingKey(id: string, prefix?: string): string {
  return objectKey(prefix, `${id}.mp4`);
}

/**
 * Resolvable URL for a session's recording, derived from its id and the
 * server's storage config. Returns `undefined` when storage isn't configured
 * or when no recording exists at that key (never recorded, or still in flight).
 *
 * The key is derived from the id — so this works after `stop()` has discarded
 * the in-memory session — and existence is confirmed against storage.
 */
export async function recordingUrl(id: string): Promise<string | undefined> {
  const storage = getStorage();
  if (!storage) return undefined;

  const key = recordingKey(id, storage.prefix);
  if (!(await storage.adapter.exists(key))) return undefined;
  return storage.adapter.url(key);
}
