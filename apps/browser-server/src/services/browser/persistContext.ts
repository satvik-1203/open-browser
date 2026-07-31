import fs from "node:fs/promises";

import { logger } from "@repo/logger";
import type { ContextSaveResult } from "@repo/types";

import type { BrowserSession } from "@/lib/browsers.types";
import {
  commitContextSnapshot,
  fetchContextSlot,
} from "@/services/callback/notifyBackend";
import {
  discardProfile,
  packProfile,
  profileArchiveKey,
  uploadProfile,
} from "@/services/context/index";

/**
 * How many times to retry when another writer commits first. Each retry is one
 * more upload of an already-packed archive.
 */
const MAX_COMMIT_ATTEMPTS = 3;

/**
 * Write the session's profile back into its context.
 *
 * A whole-artifact overwrite, deliberately: a Chromium profile is a set of
 * interdependent SQLite and LevelDB stores, so there is no meaningful way to
 * merge two of them the way cookies merged per key. Several sessions may still
 * run against one context — each gets its own copy — but the last one to end
 * wins the write-back. That is the same trade Browserbase makes ("Avoid having
 * multiple sessions using the same Context at once"), and the reason it is
 * acceptable here is that the version pointer only ever moves to a fully
 * uploaded archive, so a loser overwrites but never corrupts.
 *
 * MUST run with the browser already closed — see `packProfile`. This is the
 * reverse of the old ordering, where the snapshot had to be read from a *live*
 * browser over CDP.
 *
 * The session's profile directory is always removed, saved or not.
 */
export async function persistContext(
  session: BrowserSession,
): Promise<ContextSaveResult | undefined> {
  const context = session.context;
  if (!context) return undefined;

  const { dir } = context;
  try {
    if (!context.persist) return undefined;

    if (session.browser.connected) {
      // Packing a live profile yields a torn archive, so refuse rather than
      // store something that may not open.
      logger.warn("context not saved: browser still running", {
        id: session.id,
        contextId: context.id,
      });
      return {
        id: context.id,
        saved: false,
        error: "browser was still running when the profile was to be archived",
      };
    }

    const { tarPath, sizeBytes } = await packProfile(dir);
    try {
      let lastError = "commit failed";
      for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt++) {
        const slot = await fetchContextSlot(context.id);
        if (!slot?.body) {
          lastError = "could not read the context's current version";
          break;
        }
        const { version } = slot.body;

        // A fresh key every time, never the one currently pointed at: if this
        // write fails partway, the live version is untouched and loadable.
        const key = profileArchiveKey(context.id, version + 1);
        await uploadProfile(tarPath, key);

        const commit = await commitContextSnapshot(context.id, {
          fromVersion: version,
          key,
          sizeBytes,
        });

        if (commit?.status === 200) {
          logger.info("context profile saved", {
            id: session.id,
            contextId: context.id,
            version: commit.body?.version,
            sizeBytes,
            attempt,
          });
          return { id: context.id, saved: true, sizeBytes };
        }

        if (commit?.status === 409) {
          // Another session committed while we were uploading. Nothing to
          // re-derive — the archive is already what this session ended with —
          // so just aim at the version that won.
          logger.info("context commit raced; retrying against the winner", {
            id: session.id,
            contextId: context.id,
            attempt,
            winner: commit.body?.version,
          });
          lastError = "lost the commit race repeatedly";
          continue;
        }

        lastError = `commit rejected (${commit?.status ?? "no response"})`;
        break;
      }

      logger.error("context profile save failed", {
        id: session.id,
        contextId: context.id,
        error: lastError,
      });
      return { id: context.id, saved: false, error: lastError };
    } finally {
      await fs.rm(tarPath, { force: true }).catch(() => {});
    }
  } catch (error) {
    // Never throw from teardown. The backend keeps the previous version live
    // and flags the context `failed`, so the profile degrades to "stale"
    // rather than "destroyed".
    const message = error instanceof Error ? error.message : String(error);
    logger.error("context profile save failed", {
      id: session.id,
      contextId: context.id,
      error: message,
    });
    return { id: context.id, saved: false, error: message };
  } finally {
    await discardProfile(dir);
  }
}
