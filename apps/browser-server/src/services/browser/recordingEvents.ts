import type { Readable } from "node:stream";
import {
  recordingBodyKey,
  recordingEventsKey,
} from "@/services/browser/recordingUrl";
import { getStorage } from "@/services/storage/index";

/** True when an S3 error means "object not found" rather than a real failure. */
function isNotFound(err: unknown): boolean {
  const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
  const name = (err as { name?: string })?.name;
  return status === 404 || name === "NoSuchKey" || name === "NotFound";
}

async function openStream(key: string): Promise<Readable | undefined> {
  const storage = getStorage();
  if (!storage) return undefined;
  try {
    return await storage.adapter.getStream(key);
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw err;
  }
}

/**
 * Readable stream over a session's `events.ndjson`, or `undefined` when storage
 * isn't configured or the object doesn't exist (never recorded / still in
 * flight). The key is derived from the id, so this works after the in-memory
 * session is gone.
 */
export function recordingEventsStream(
  id: string,
): Promise<Readable | undefined> {
  const storage = getStorage();
  if (!storage) return Promise.resolve(undefined);
  return openStream(recordingEventsKey(id, storage.prefix));
}

/** Readable stream over one captured response body, or `undefined` if absent. */
export function recordingBodyStream(
  id: string,
  requestId: string,
): Promise<Readable | undefined> {
  const storage = getStorage();
  if (!storage) return Promise.resolve(undefined);
  return openStream(recordingBodyKey(id, requestId, storage.prefix));
}
