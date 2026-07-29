import { logger } from "@repo/logger";
import type { ContextSaveResult, StorageState } from "@repo/types";

import type { BrowserSession } from "@/lib/browsers.types";
import {
  commitContextSnapshot,
  fetchContextSlot,
} from "@/services/callback/notifyBackend";
import {
  applyDelta,
  captureState,
  computeDelta,
  contextSnapshotKey,
  isEmptyDelta,
  loadSnapshot,
  saveSnapshot,
} from "@/services/context/index";

/**
 * How many times to re-merge when another writer commits first. Each retry is
 * one extra read + merge + write, and losing three races in a row means the
 * context is under heavy concurrent write — at which point failing and keeping
 * the previous version beats spinning through teardown.
 */
const MAX_COMMIT_ATTEMPTS = 3;

const EMPTY: StorageState = { cookies: [], origins: [] };

/**
 * Write the session's changes back into its context.
 *
 * Not a whole-state overwrite: we diff the final state against the snapshot
 * this session *loaded*, and apply only that delta onto whatever version is
 * current at save time. That's what lets several sessions write to one context
 * — two agents working different sites both keep their logins, instead of the
 * last one to finish erasing the other.
 *
 * The commit is conditional on the version we merged from still being current.
 * If another writer landed in between, we re-read and re-merge: the delta is
 * still valid, only its base moved.
 *
 * MUST run while the browser is alive — reading localStorage needs a live
 * document — which is why teardown calls this before `finalizeRecording`.
 *
 * A crash is the known gap: `disconnected` fires with the browser already gone,
 * so nothing can be read and the context keeps its previous version.
 */
export async function persistContext(
  session: BrowserSession,
): Promise<ContextSaveResult | undefined> {
  const context = session.context;
  if (!context?.persist) return undefined;

  if (!session.browser.connected) {
    logger.warn("context not saved: browser already gone", {
      id: session.id,
      contextId: context.id,
    });
    return {
      id: context.id,
      saved: false,
      error: "browser disconnected before the context could be captured",
    };
  }

  try {
    const next = await captureState(session.browser, context.origins);
    const delta = computeDelta(context.base, next);

    if (isEmptyDelta(delta)) {
      // Nothing changed. Writing a byte-identical new version would only burn
      // a version number and invalidate other writers' bases for no reason.
      logger.info("context unchanged; nothing to save", {
        id: session.id,
        contextId: context.id,
      });
      return {
        id: context.id,
        saved: true,
        cookies: next.cookies.length,
        origins: next.origins.length,
      };
    }

    let lastError = "commit failed";
    for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt++) {
      const slot = await fetchContextSlot(context.id);
      if (!slot?.body) {
        lastError = "could not read the context's current version";
        break;
      }
      const { version, snapshotKey } = slot.body;

      // Merge onto what's there right now — which may already include another
      // session's write-back that landed while this one was running.
      const current = snapshotKey ? await loadSnapshot(snapshotKey) : undefined;
      const merged = applyDelta(current ?? EMPTY, delta);

      // A fresh key every time, never the one we read from: if this write
      // fails partway, the version still pointed at is untouched and loadable.
      const key = contextSnapshotKey(context.id, version + 1);
      const { sizeBytes } = await saveSnapshot(key, merged);

      const commit = await commitContextSnapshot(context.id, {
        fromVersion: version,
        key,
        sizeBytes,
      });

      if (commit?.status === 200) {
        logger.info("context saved", {
          id: session.id,
          contextId: context.id,
          version: commit.body?.version,
          cookies: merged.cookies.length,
          origins: merged.origins.length,
          sizeBytes,
          attempt,
        });
        return {
          id: context.id,
          saved: true,
          sizeBytes,
          cookies: merged.cookies.length,
          origins: merged.origins.length,
        };
      }

      if (commit?.status === 409) {
        // Another writer got there first; our delta still applies, so re-merge
        // against the version that won.
        logger.info("context commit raced; re-merging", {
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

    logger.error("context save failed", {
      id: session.id,
      contextId: context.id,
      error: lastError,
    });
    return { id: context.id, saved: false, error: lastError };
  } catch (error) {
    // Never throw from teardown. The backend keeps the previous version live
    // and flags the context `failed`, so the profile degrades to "stale"
    // rather than "destroyed".
    const message = error instanceof Error ? error.message : String(error);
    logger.error("context save failed", {
      id: session.id,
      contextId: context.id,
      error: message,
    });
    return { id: context.id, saved: false, error: message };
  }
}
