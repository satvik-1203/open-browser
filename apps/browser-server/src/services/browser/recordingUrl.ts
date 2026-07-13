import { getStorage, objectKey } from "@/services/storage/index";

/** How long a signed recording URL stays valid (1 hour). */
const RECORDING_URL_TTL_SECONDS = 3600;

/** Object key a session's recording is stored under. */
export function recordingKey(id: string, prefix?: string): string {
  return objectKey(prefix, `${id}.mp4`);
}

/**
 * Object key for one target's raw CDP log — archival source of truth, kept so
 * the read-optimized `events.ndjson` can be re-derived if its shape changes. One
 * `${targetId}.log` file per target under the session's `raw/` folder.
 */
export function recordingRawLogKey(
  id: string,
  targetId: string,
  prefix?: string,
): string {
  return objectKey(prefix, `${id}/raw/${targetId}.log`);
}

/**
 * Object key for the session's read-optimized event stream — one light
 * newline-delimited JSON row per network/console/action/navigation event, with
 * response bodies split out (see `recordingBodyKey`). This is what the recording
 * page's timeline/network/console tabs load.
 */
export function recordingEventsKey(id: string, prefix?: string): string {
  return objectKey(prefix, `${id}/events.ndjson`);
}

/**
 * Object key for one captured response body, addressed by its CDP `requestId`.
 * Bodies are stored as their own objects so `events.ndjson` stays small and a
 * body is only fetched when a request is inspected.
 */
export function recordingBodyKey(
  id: string,
  requestId: string,
  prefix?: string,
): string {
  return objectKey(prefix, `${id}/bodies/${requestId}`);
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
