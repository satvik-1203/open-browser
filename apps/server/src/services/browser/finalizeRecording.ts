import { createReadStream } from "node:fs";
import { logger } from "@repo/logger";
import type { BrowserSession } from "@/lib/browsers.types";
import {
  cleanupRecording,
  encodeRecording,
} from "@/services/recording/index";
import { createAdapter, objectKey } from "@/services/storage/index";

/**
 * Stop the session's recorder, encode the mp4, and upload it via the session's
 * storage adapter, updating `session.recording` as it progresses. Safe to call
 * more than once (e.g. an unexpected disconnect racing with an explicit stop):
 * the recorder is cleared up front so subsequent calls no-op.
 */
export async function finalizeRecording(session: BrowserSession): Promise<void> {
  const { recorder, adapter } = session;
  if (!recorder || !adapter) return;

  session.recorder = undefined;
  session.recording = { status: "processing" };

  let dir: string | undefined;
  try {
    const capture = await recorder.stop();
    dir = capture.dir;

    const mp4Path = await encodeRecording(capture);
    const key = objectKey(adapter.prefix, `${session.id}.mp4`);
    const storage = createAdapter(adapter);
    const { url } = await storage.store({
      key,
      body: createReadStream(mp4Path),
      contentType: "video/mp4",
    });

    session.recording = { status: "completed", key, url };
    logger.info("recording stored", { id: session.id, key });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    session.recording = { status: "failed", error: message };
    logger.error("recording failed", { id: session.id, error: message });
  } finally {
    if (dir) await cleanupRecording(dir);
  }
}
