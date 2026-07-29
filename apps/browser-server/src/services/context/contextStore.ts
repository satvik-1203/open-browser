import { gunzipSync, gzipSync } from "node:zlib";

import { logger } from "@repo/logger";
import type { StorageState } from "@repo/types";

import { getStorage } from "@/services/storage/index";

/**
 * Refuse to store a snapshot bigger than this. localStorage allows ~5-10MB per
 * origin, so a session that touched a lot of storage-heavy sites could produce
 * something absurd; the cap keeps one runaway profile from becoming a
 * permanent, slow-to-load tax on every session that uses it. Steel draws the
 * same line at 300MB for full profiles — ours holds far less, so it's tighter.
 */
export const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;

export class SnapshotTooLargeError extends Error {}

/**
 * Key for a version of a context's snapshot.
 *
 * Deliberately NOT under the storage prefix: that prefix scopes *recordings*
 * (`AWS_S3_PREFIX=recordings/`), and contexts are a different kind of object
 * that happens to share the bucket. Filing them under it would also strand
 * every snapshot written before this key scheme existed.
 */
export function contextSnapshotKey(contextId: string, version: number): string {
  return `contexts/${contextId}/${version}.json.gz`;
}

/**
 * Read and parse a snapshot, or undefined when the key isn't there.
 *
 * The missing case has to be a value, not a throw: a context row can outlive
 * its object (a bad save, a lifecycle rule, a hand-edited key), and the caller's
 * job then is to start clean — not to fail the whole session over a profile it
 * could do without.
 */
export async function loadSnapshot(
  key: string,
): Promise<StorageState | undefined> {
  const storage = getStorage();
  if (!storage) return undefined;
  if (!(await storage.adapter.exists(key))) return undefined;

  const stream = await storage.adapter.getStream(key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  const raw = Buffer.concat(chunks);
  // Snapshots are written gzipped, but a hand-seeded one (someone PUTting a
  // Playwright storageState straight in) may be plain JSON. Sniff the gzip
  // magic rather than making the caller declare which it is.
  const json =
    raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  return JSON.parse(json) as StorageState;
}

/**
 * Write a snapshot to `key`, gzipped. The caller picks the key and it is always
 * a fresh one — snapshots are never overwritten in place, so a save that fails
 * midway leaves the previous version untouched and still loadable.
 */
export async function saveSnapshot(
  key: string,
  state: StorageState,
): Promise<{ sizeBytes: number }> {
  const storage = getStorage();
  if (!storage) throw new Error("storage is not configured on this server");

  // gzip earns its keep here: storage state is highly repetitive JSON (long
  // base64-ish token values, repeated key names) and typically shrinks 5-10x.
  const body = gzipSync(Buffer.from(JSON.stringify(state), "utf8"));
  if (body.byteLength > MAX_SNAPSHOT_BYTES) {
    throw new SnapshotTooLargeError(
      `snapshot is ${body.byteLength} bytes, over the ${MAX_SNAPSHOT_BYTES} byte limit`,
    );
  }

  await storage.adapter.store({
    key,
    body,
    contentType: "application/json",
  });
  logger.info("context snapshot stored", { key, sizeBytes: body.byteLength });
  return { sizeBytes: body.byteLength };
}
