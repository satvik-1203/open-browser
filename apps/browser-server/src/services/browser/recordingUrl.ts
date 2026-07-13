import { getStorage, objectKey } from "@/services/storage/index";

/** How long a signed recording URL stays valid (1 hour). */
const RECORDING_URL_TTL_SECONDS = 3600;

/** Object key a session's recording is stored under. */
export function recordingKey(id: string, prefix?: string): string {
  return objectKey(prefix, `${id}.mp4`);
}

/**
 * Object key for one target's CDP log. The logs live in a folder named by the
 * session id (a sibling of `${id}.mp4`), one `${targetId}.log` file per target
 * so out-of-process iframes and workers each get their own log.
 */
export function recordingLogKey(
  id: string,
  targetId: string,
  prefix?: string,
): string {
  return objectKey(prefix, `${id}/${targetId}.log`);
}

/**
 * Short-lived signed URL for a session's recording, derived from its id and the
 * server's storage config. Returns `undefined` when storage isn't configured or
 * when no recording exists at that key (never recorded, or still in flight).
 *
 * The key is derived from the id — so this works after `stop()` has discarded
 * the in-memory session — and existence is confirmed against storage. The URL
 * is signed so a client without credentials can fetch the private object.
 */
export async function recordingUrl(
  id: string,
  options?: { downloadFilename?: string },
): Promise<string | undefined> {
  const storage = getStorage();
  if (!storage) return undefined;

  const key = recordingKey(id, storage.prefix);
  if (!(await storage.adapter.exists(key))) return undefined;
  return storage.adapter.signedUrl(key, RECORDING_URL_TTL_SECONDS, options);
}
