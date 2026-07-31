import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { logger } from "@repo/logger";

import { getStorage } from "@/services/storage/index";

const run = promisify(execFile);

/**
 * Refuse to store a profile bigger than this. A profile that has grown past it
 * is almost always cache that escaped the prune list, and a runaway one would
 * become a permanent tax on every session that loads the context.
 */
export const MAX_PROFILE_BYTES = 256 * 1024 * 1024;

export class ProfileTooLargeError extends Error {}

/**
 * Key for a version of a context's profile.
 *
 * Same scheme the cookie snapshots used — deliberately NOT under the storage
 * prefix, which scopes *recordings* — with the extension changed because the
 * artifact is now a tarball of the Chromium user data directory rather than a
 * JSON document.
 */
export function profileArchiveKey(contextId: string, version: number): string {
  return `contexts/${contextId}/${version}.tar.gz`;
}

/**
 * Directories dropped before archiving. All of it is regenerable cache and none
 * of it is login state, and it is the bulk of a profile on disk — pruning is
 * what keeps a real logged-in profile around 2MB compressed instead of
 * hundreds. Browserbase draws the same line, excluding the HTTP cache from
 * their contexts.
 */
const PRUNE = [
  "Default/Cache",
  "Default/Code Cache",
  "Default/GPUCache",
  "Default/DawnGraphiteCache",
  "Default/DawnWebGPUCache",
  "Default/Service Worker/CacheStorage",
  "Default/Service Worker/ScriptCache",
  "GrShaderCache",
  "ShaderCache",
  "GraphiteDawnCache",
  "component_crx_cache",
  "extensions_crx_cache",
];

/**
 * A private Chromium user data directory for one session, seeded from the
 * context's stored profile when it has one.
 *
 * Private per session, never shared: Chromium takes a `ProcessSingleton` lock on
 * a profile directory and refuses to start a second browser on one — "Aborting
 * now to avoid profile corruption", in its own words. Two sessions on one
 * context therefore each get their own copy, and the last to end wins the
 * write-back.
 */
export async function materializeProfile(loadKey?: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ob-profile-"));
  if (!loadKey) return dir;

  const storage = getStorage();
  if (!storage) return dir;

  const tarPath = `${dir}.tar.gz`;
  try {
    const stream = await storage.adapter.getStream(loadKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    await fs.writeFile(tarPath, Buffer.concat(chunks));
    try {
      await run("tar", ["xzf", tarPath, "-C", dir]);
      logger.info("context profile restored", { key: loadKey });
    } catch (error) {
      // Not a profile archive we can read. The common case is a context written
      // before profiles existed, whose key still points at a cookie snapshot
      // (`.json.gz`) — tar rejects it. Start clean rather than fail the session:
      // the caller gets a usable browser and the next save replaces the key with
      // a real archive, which is the whole migration.
      logger.warn("context profile unreadable; starting clean", {
        key: loadKey,
        error: error instanceof Error ? error.message : String(error),
      });
      // Wipe whatever tar managed to write before it gave up, so Chromium never
      // starts on a half-extracted profile.
      await fs.rm(dir, { recursive: true, force: true });
      await fs.mkdir(dir, { recursive: true });
    }
  } catch (error) {
    if (isNotFound(error)) {
      // The row pointed at a key that isn't there. Start clean rather than
      // fail — the caller gets a usable browser and the next save repairs it.
      logger.warn("context profile missing; starting clean", { key: loadKey });
    } else {
      await discardProfile(dir);
      throw error;
    }
  } finally {
    await fs.rm(tarPath, { force: true }).catch(() => {});
  }
  return dir;
}

/** A storage error that means "no such object", as opposed to a real failure. */
function isNotFound(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    ?.$metadata?.httpStatusCode;
  return (
    status === 404 ||
    (error instanceof Error &&
      (error.name === "NoSuchKey" || error.name === "NotFound"))
  );
}

/**
 * Tar the profile up, ready to upload.
 *
 * MUST run with the browser fully exited. A profile is a set of SQLite and
 * LevelDB stores; archiving one from under a live Chromium yields a torn
 * snapshot that may not open. This is the one hard ordering constraint the
 * cookie-snapshot approach did not have, since that could be captured over CDP
 * on a running browser.
 *
 * Packed once and uploaded per attempt, so losing a commit race costs another
 * upload rather than another tar of the whole profile.
 */
export async function packProfile(
  dir: string,
): Promise<{ tarPath: string; sizeBytes: number }> {
  for (const rel of PRUNE) {
    await fs.rm(path.join(dir, rel), { recursive: true, force: true });
  }
  const tarPath = `${dir}.pack.tar.gz`;
  await run("tar", ["czf", tarPath, "-C", dir, "."]);
  const { size } = await fs.stat(tarPath);
  // Entry count is the cheap tell that a profile is real: a browser that wrote
  // nothing (or a directory that was emptied under us) packs to a handful of
  // files, which is indistinguishable from a successful save by size alone.
  const entries = (await fs.readdir(path.join(dir, "Default")).catch(() => []))
    .length;
  logger.info("context profile packed", { sizeBytes: size, defaultEntries: entries });
  if (size > MAX_PROFILE_BYTES) {
    await fs.rm(tarPath, { force: true }).catch(() => {});
    throw new ProfileTooLargeError(
      `profile is ${size} bytes, over the ${MAX_PROFILE_BYTES} byte limit`,
    );
  }
  return { tarPath, sizeBytes: size };
}

/**
 * Upload a packed profile to `key`. Always a fresh key, never one already
 * pointed at — so a save that fails midway leaves the previous version
 * untouched and still loadable.
 */
export async function uploadProfile(
  tarPath: string,
  key: string,
): Promise<void> {
  const storage = getStorage();
  if (!storage) throw new Error("storage is not configured on this server");
  await storage.adapter.store({
    key,
    body: await fs.readFile(tarPath),
    contentType: "application/gzip",
  });
  logger.info("context profile stored", { key });
}

/** Remove a session's profile directory. Best-effort; never throws. */
export async function discardProfile(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch((error: unknown) => {
    logger.warn("could not remove profile dir", {
      dir,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
