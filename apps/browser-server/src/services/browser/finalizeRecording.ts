import { createReadStream } from "node:fs";
import { logger } from "@repo/logger";
import type { BrowserSession } from "@/lib/browsers.types";
import {
  recordingBodyKey,
  recordingEventsKey,
  recordingKey,
  recordingRawLogKey,
} from "@/services/browser/recordingUrl";
import {
  buildEvents,
  cleanupRecording,
  encodeRecording,
} from "@/services/recording/index";
import { getStorage } from "@/services/storage/index";

/** Max artifact uploads in flight at once (see the pooled uploads below). */
const UPLOAD_CONCURRENCY = 8;

/**
 * Run `fn` over `items` with at most `limit` in flight at once — parallel enough
 * to be fast, bounded so a body-heavy session can't open hundreds of concurrent
 * read streams / S3 connections. Never rejects for a single item: `fn` owns its
 * own error handling.
 */
async function pooled<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = items.slice();
  const runners = Array.from(
    { length: Math.min(limit, queue.length) },
    async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item !== undefined) await fn(item);
      }
    },
  );
  await Promise.all(runners);
}

/**
 * Stop the session's recorder, encode the mp4, and upload it via the server's
 * configured storage, updating `session.recording` as it progresses. Closes the
 * browser as soon as the capture is drained (encode + upload don't need it).
 * Safe to call more than once (e.g. an unexpected disconnect racing with an
 * explicit stop): the recorder is cleared up front so subsequent calls no-op.
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

    // recorder.stop() has drained the final frames and fetched the pending
    // response bodies over CDP — nothing left (ffmpeg encode, the log transform,
    // the uploads) touches the browser, only local files. Close it now so a
    // headless Chrome process isn't pinned through the slow encode + upload. The
    // resulting `disconnected` no-ops (endHandled is already set by the caller).
    await session.browser.close().catch(() => {});

    // Encode the mp4 (ffmpeg, CPU-bound) and transform the raw logs into the
    // read-optimized event stream (I/O-bound) at the same time — they touch
    // different files and don't depend on each other. allSettled (not all) so
    // that if encode fails we still wait for buildEvents to finish writing before
    // the `finally` cleanup removes the dir out from under it.
    const [encodeRes, buildRes] = await Promise.allSettled([
      encodeRecording(capture),
      buildEvents(capture, (requestId) =>
        recordingBodyKey(session.id, requestId, storage.prefix),
      ),
    ]);
    // The video is required: a failed encode fails the whole recording.
    if (encodeRes.status === "rejected") throw encodeRes.reason;
    const mp4Path = encodeRes.value;
    // The transform is best-effort — a failure just drops the events tab, never
    // the video.
    const built = buildRes.status === "fulfilled" ? buildRes.value : null;
    if (buildRes.status === "rejected") {
      logger.warn("recording events build failed", {
        id: session.id,
        error:
          buildRes.reason instanceof Error
            ? buildRes.reason.message
            : String(buildRes.reason),
      });
    }

    // The video is the artifact that defines a completed recording, so its
    // upload is required — a failure here fails the recording (caught below).
    const key = recordingKey(session.id, storage.prefix);
    await storage.adapter.store({
      key,
      body: createReadStream(mp4Path),
      contentType: "video/mp4",
    });
    session.recording = { status: "completed" };
    logger.info("recording stored", {
      id: session.id,
      key,
      logs: capture.logs.length,
    });

    // Upload the shaped outputs (events + split-out bodies + archival raw logs)
    // in parallel but bounded — a body-heavy session could otherwise open
    // hundreds of concurrent streams. All best-effort: the video is already
    // stored, so a failed artifact upload must not flip the session to "failed".
    if (built) {
      const artifacts = [
        {
          key: recordingEventsKey(session.id, storage.prefix),
          file: built.eventsFile,
          contentType: "application/x-ndjson",
        },
        ...built.bodies.map((body) => ({
          key: body.key,
          file: body.file,
          contentType: "application/octet-stream",
        })),
        // Archive the raw per-target logs so events.ndjson can be re-derived.
        ...capture.logs.map((log) => ({
          key: recordingRawLogKey(session.id, log.targetId, storage.prefix),
          file: log.file,
          contentType: "application/x-ndjson",
        })),
      ];

      await pooled(artifacts, UPLOAD_CONCURRENCY, async (artifact) => {
        try {
          await storage.adapter.store({
            key: artifact.key,
            body: createReadStream(artifact.file),
            contentType: artifact.contentType,
          });
        } catch (uploadErr) {
          logger.warn("recording artifact upload failed", {
            id: session.id,
            key: artifact.key,
            error: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
          });
        }
      });

      logger.info("recording events stored", {
        id: session.id,
        bodies: built.bodies.length,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    session.recording = { status: "failed", error: message };
    logger.error("recording failed", { id: session.id, error: message });
  } finally {
    if (dir) await cleanupRecording(dir);
  }
}
