import { logger } from "@repo/logger";
import type { ContextSaveResult } from "@repo/types";

import type { BrowserSession } from "@/lib/browsers.types";
import { captureState, saveSnapshot } from "@/services/context/index";

/**
 * Snapshot the session's cookies + localStorage into the context it holds the
 * write lease for, and report the outcome so the backend can promote the new
 * version.
 *
 * Returns undefined when there is nothing to do: no context, or a read-only
 * session (no `saveKey`), which is the default and the case that lets several
 * sessions fork one context concurrently.
 *
 * MUST run while the browser is still alive — reading localStorage needs a live
 * document. That's why teardown calls this before `finalizeRecording`, which
 * closes the browser as soon as the capture is drained.
 *
 * A crash is the gap: `disconnected` fires with the browser already gone, so
 * nothing can be read and the context keeps its previous version. Sessions that
 * end normally are unaffected.
 */
export async function persistContext(
  session: BrowserSession,
): Promise<ContextSaveResult | undefined> {
  const context = session.context;
  if (!context?.saveKey) return undefined;

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
    const state = await captureState(session.browser, context.origins);
    const { sizeBytes } = await saveSnapshot(context.saveKey, state);
    logger.info("context saved", {
      id: session.id,
      contextId: context.id,
      cookies: state.cookies.length,
      origins: state.origins.length,
      sizeBytes,
    });
    return {
      id: context.id,
      saved: true,
      sizeBytes,
      cookies: state.cookies.length,
      origins: state.origins.length,
    };
  } catch (error) {
    // Never throw from teardown. The backend keeps the previous version live
    // and flags the context `failed`, so the profile degrades to "stale" rather
    // than "destroyed".
    const message = error instanceof Error ? error.message : String(error);
    logger.error("context save failed", {
      id: session.id,
      contextId: context.id,
      error: message,
    });
    return { id: context.id, saved: false, error: message };
  }
}
