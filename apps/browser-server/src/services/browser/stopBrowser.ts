import { logger } from "@repo/logger";
import type { RecordingInfo } from "@repo/types";
import { sessions } from "@/lib/browsers";
import { handleSessionEnd } from "@/services/browser/handleSessionEnd";
import type { StopBrowserResult } from "@/services/browser/types";

export function stopBrowser(id: string): StopBrowserResult | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;

  // Snapshot the recording state now: if a recording is open we report it as
  // `processing`, because storing it (ffmpeg encode + upload) is slow and runs
  // in the background below. Its real final status reaches the backend via the
  // session-ended callback once finalize completes.
  const recording: RecordingInfo | undefined = session.recorder
    ? { status: "processing" }
    : session.recording;

  // Fire-and-forget the whole teardown so `stop` returns instantly. finalize
  // (encode + upload) needs the page alive, so the browser is closed only after
  // it. handleSessionEnd sets `endHandled` synchronously, so the `disconnected`
  // handler that `close()` triggers no-ops rather than ending the session twice.
  void handleSessionEnd(session, { status: "stopped" })
    .then(() => session.browser.close())
    .catch((error: unknown) => {
      logger.error("background stop teardown failed", {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return { recording };
}
