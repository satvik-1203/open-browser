import { logger } from "@repo/logger";
import type { BrowserSessionEndStatus } from "@repo/types";

import { sessions } from "@/lib/browsers";
import type { BrowserSession } from "@/lib/browsers.types";
import { finalizeRecording } from "@/services/browser/finalizeRecording";
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
  sessions.delete(session.id);

  logger.info("browser session ended", {
    id: session.id,
    status,
    recordingStatus: session.recording?.status,
  });

  const delivery = notifySessionEnded(session.id, {
    status,
    recording: session.recording,
  });
  if (flush) await delivery;
}
