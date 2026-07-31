import { logger } from "@repo/logger";
import type { BrowserSessionEndStatus } from "@repo/types";

import { sessions } from "@/lib/browsers";
import type { BrowserSession } from "@/lib/browsers.types";
import { finalizeRecording } from "@/services/browser/finalizeRecording";
import { persistContext } from "@/services/browser/persistContext";
import { notifySessionEnded } from "@/services/callback/notifyBackend";

interface HandleSessionEndOptions {
  /**
   * Terminal status to report. Defaults to `failed` — the fallback for an
   * unexpected `disconnected` (a crash). Explicit callers pass `stopped` (user
   * stop) or `server-error` (browser server going down).
   */
  status?: BrowserSessionEndStatus;
  /**
   * Await delivery of the backend callback before resolving. Off by default
   * (fire-and-forget, no added latency); on during shutdown so the callbacks
   * actually flush before the process exits.
   */
  flush?: boolean;
}

/**
 * Settle a session that has ended. Idempotent via `session.endHandled`:
 * whichever of an explicit teardown or the `disconnected` event reaches it
 * first wins and the other no-ops, so the backend gets exactly one end callback
 * per session. Finalizes any recording, drops the session from the in-memory
 * map, and reports the terminal status to the backend.
 */
export async function handleSessionEnd(
  session: BrowserSession,
  { status = "failed", flush = false }: HandleSessionEndOptions = {},
): Promise<void> {
  if (session.endHandled) return;
  session.endHandled = true;

  // Never let a recording-finalization failure abort teardown: if it threw, the
  // session would linger in the map (a zombie) and the backend would never get
  // the end callback. Finalize is best-effort; deletion + notify must still run.
  await finalizeRecording(session).catch((error: unknown) => {
    logger.warn("recording finalization failed; continuing session teardown", {
      id: session.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  // The browser must be gone before the profile is archived: it is a set of
  // SQLite and LevelDB stores, and taring them from under a live Chromium gives
  // a torn archive. finalizeRecording closes it once the capture is drained,
  // but only when there *was* a recording — so close it here too, and wait for
  // the process to actually exit. This is the reverse of the old ordering,
  // where the cookie snapshot had to be read from a live browser over CDP.
  if (session.browser.connected) {
    await session.browser.close().catch((error: unknown) => {
      logger.warn("browser close failed before context save", {
        id: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  // Always called when a context is attached, persisting or not — it also owns
  // removing the session's profile directory, which must happen either way.
  const context = await persistContext(session);

  sessions.delete(session.id);

  logger.info("browser session ended", {
    id: session.id,
    status,
    recordingStatus: session.recording?.status,
  });

  const delivery = notifySessionEnded(session.id, {
    status,
    recording: session.recording,
    context,
  });
  if (flush) await delivery;
}
