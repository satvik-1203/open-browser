import { createReadStream } from "node:fs";
import { logger } from "@repo/logger";
import type { BrowserSession } from "@/lib/browsers.types";
import { recordingKey, recordingLogKey } from "@/services/browser/recordingUrl";
import {
  cleanupRecording,
  encodeRecording,
} from "@/services/recording/index";
import { getStorage } from "@/services/storage/index";

/**
 * Stop the session's recorder, encode the mp4, and upload it via the server's
 * configured storage, updating `session.recording` as it progresses. Safe to
 * call more than once (e.g. an unexpected disconnect racing with an explicit
 * stop): the recorder is cleared up front so subsequent calls no-op.
 */
export async function finalizeRecording(session: BrowserSession): Promise<void> {
  const { recorder } = session;
  if (!recorder) return;

  const storage = getStorage();
  // Recording only starts when storage is configured, so this is defensive.
  if (!storage) return;

  session.recorder = undefined;
  session.recording = { status: "processing" };

  let dir: string | undefined;
  try {
    const capture = await recorder.stop();
    dir = capture.dir;

    const mp4Path = await encodeRecording(capture);
    const key = recordingKey(session.id, storage.prefix);
    await storage.adapter.store({
      key,
      body: createReadStream(mp4Path),
      contentType: "video/mp4",
    });

    // Store each target's CDP log in a folder named by the session id, one file
    // per target id (page + any out-of-process iframes/workers). Best-effort:
    // the video is already stored, so a failed log upload must not flip the
    // session to "failed" and hide an otherwise-good recording.
    for (const log of capture.logs) {
      try {
        await storage.adapter.store({
          key: recordingLogKey(session.id, log.targetId, storage.prefix),
          body: createReadStream(log.file),
          contentType: "application/x-ndjson",
        });
      } catch (logErr) {
        const logMessage =
          logErr instanceof Error ? logErr.message : String(logErr);
        logger.warn("cdp log upload failed", {
          id: session.id,
          targetId: log.targetId,
          error: logMessage,
        });
      }
    }

    session.recording = { status: "completed" };
    logger.info("recording stored", {
      id: session.id,
      key,
      logs: capture.logs.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    session.recording = { status: "failed", error: message };
    logger.error("recording failed", { id: session.id, error: message });
  } finally {
    if (dir) await cleanupRecording(dir);
  }
}
