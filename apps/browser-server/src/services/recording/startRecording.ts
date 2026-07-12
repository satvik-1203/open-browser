import { createWriteStream, existsSync, type WriteStream } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CDPSession, Page } from "puppeteer";
import type {
  Capture,
  CaptureFrame,
  CaptureLog,
  Recorder,
  RecordingConfig,
} from "@/services/recording/types";

const DEFAULT_CONFIG: RecordingConfig = {
  quality: 60,
  everyNthFrame: 1,
  maxWidth: 1280,
  maxHeight: 720,
};

/**
 * CDP domains enabled on every captured target so their events fire, and the
 * events captured from each. Console output, uncaught exceptions, browser log
 * entries, and network activity together trace what a target did while
 * recorded.
 */
const CDP_LOG_DOMAINS = [
  "Runtime.enable",
  "Log.enable",
  "Network.enable",
  "Page.enable",
] as const;
const CDP_LOG_EVENTS = [
  "Runtime.consoleAPICalled",
  "Runtime.exceptionThrown",
  "Log.entryAdded",
  "Network.requestWillBeSent",
  "Network.responseReceived",
  "Network.loadingFinished",
  "Network.loadingFailed",
  "Page.frameNavigated",
  "Page.loadEventFired",
] as const;

/**
 * Cap on a single captured response body (bytes). A body is pulled fully into
 * memory to fetch it, so an oversized one is logged as a marker instead of its
 * contents to keep a single large download from spiking the heap.
 */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

function recordingTmpBase(): string {
  return process.env.RECORDING_TMP_DIR || tmpdir();
}

/**
 * Start an activity-driven recording of the given page's tab. CDP only emits a
 * screencast frame when the tab repaints, so idle time costs (almost) nothing;
 * each frame is timestamped at receipt so the encoder can reproduce real-time
 * playback (see encodeRecording). `stop()` tolerates an already-closed browser.
 */
export async function startRecording(
  page: Page,
  config: RecordingConfig = DEFAULT_CONFIG,
): Promise<Recorder> {
  const dir = await mkdtemp(join(recordingTmpBase(), "obrec-"));
  const client = await page.createCDPSession();
  const frames: CaptureFrame[] = [];
  const pending: Promise<void>[] = [];
  // In-flight Network.getResponseBody calls, awaited before the session detaches.
  const pendingBodies: Promise<void>[] = [];
  let frameIndex = 0;

  // One append-only file per target (page + sub-frames/workers), keyed by target
  // id. Events are streamed straight to disk as they arrive so nothing but the
  // in-flight response bodies is held in the heap for the session's duration.
  const targetStreams = new Map<string, WriteStream>();
  const logs: CaptureLog[] = [];

  function record(targetId: string, method: string, params: unknown): void {
    const stream = targetStreams.get(targetId);
    // `writable` is false once stop() has ended the stream — a late event from a
    // still-attached child session then no-ops instead of throwing.
    if (stream?.writable) {
      stream.write(`${JSON.stringify({ ts: Date.now(), method, params })}\n`);
    }
  }

  // Wire a target's CDP session: stream its events to a file, enable the log
  // domains, and auto-attach to ITS children so nested iframes/workers are
  // captured too. Every step is best-effort — logging must never disrupt the
  // live session.
  async function captureTarget(
    session: CDPSession,
    targetId: string,
  ): Promise<void> {
    if (targetStreams.has(targetId)) return; // already wired
    const file = join(dir, `${targetId}.log`);
    const stream = createWriteStream(file);
    // Best-effort: a disk write error must not crash the process.
    stream.on("error", () => {});
    targetStreams.set(targetId, stream);
    logs.push({ targetId, file });

    for (const method of CDP_LOG_EVENTS) {
      // `method` is a runtime-iterated CDP event name; `never` sidesteps the
      // per-event overloads on `on` without widening to `any`.
      session.on(method as never, (params: unknown) =>
        record(targetId, method, params),
      );
    }
    // Fetch each response body once loading finishes (it's only retained
    // briefly after that) and record it as a synthetic Network.responseBody
    // entry, correlated to its request by requestId.
    session.on("Network.loadingFinished", (event) => {
      pendingBodies.push(
        (async () => {
          try {
            const { body, base64Encoded } = await session.send(
              "Network.getResponseBody",
              { requestId: event.requestId },
            );
            const size = base64Encoded
              ? Math.floor((body.length * 3) / 4)
              : Buffer.byteLength(body);
            record(
              targetId,
              "Network.responseBody",
              size > MAX_BODY_BYTES
                ? { requestId: event.requestId, skipped: "too-large", size }
                : { requestId: event.requestId, base64Encoded, body },
            );
          } catch {
            // No body available (redirect, evicted, detached) — skip silently.
          }
        })(),
      );
    });
    session.on("Target.attachedToTarget", (event) => {
      const child = session.connection()?.session(event.sessionId);
      if (child) void captureTarget(child, event.targetInfo.targetId);
    });

    await Promise.allSettled(CDP_LOG_DOMAINS.map((cmd) => session.send(cmd)));
    // `waitForDebuggerOnStart: false` so a new sub-target never pauses waiting
    // on us — we may miss its very first events, but never stall the page.
    await session
      .send("Target.setAutoAttach", {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
      })
      .catch(() => {});
  }

  const { targetInfo } = await client.send("Target.getTargetInfo");
  await captureTarget(client, targetInfo.targetId);

  client.on("Page.screencastFrame", (event) => {
    // Capture index + timestamp synchronously to preserve frame order even
    // though the disk write is async.
    const index = frameIndex++;
    const file = join(dir, `f${String(index).padStart(6, "0")}.jpg`);
    frames.push({ file, ts: Date.now() });

    pending.push(
      (async () => {
        try {
          await writeFile(file, Buffer.from(event.data, "base64"));
          await client.send("Page.screencastFrameAck", {
            sessionId: event.sessionId,
          });
        } catch {
          // Session detached / browser gone — drop this frame silently.
        }
      })(),
    );
  });

  const startTs = Date.now();
  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality: config.quality,
    everyNthFrame: config.everyNthFrame,
    maxWidth: config.maxWidth,
    maxHeight: config.maxHeight,
  });

  return {
    async stop(): Promise<Capture> {
      const stopTs = Date.now();
      try {
        await client.send("Page.stopScreencast");
      } catch {
        // Browser may already be gone; frames already on disk are still usable.
      }
      await Promise.allSettled(pending);
      // Bodies must be fetched before detach — the session can't answer after.
      // Their records are streamed to disk as they resolve, not held here.
      await Promise.allSettled(pendingBodies);
      try {
        await client.detach();
      } catch {
        // Ignore — session already detached.
      }

      // Close every target's log stream and wait for the last bytes to flush to
      // disk before the files are handed off for upload. Settle on whichever of
      // close/error comes first (and resolve immediately if a write error
      // already destroyed the stream) so a broken stream can't hang stop() —
      // and with it leave the session wedged in "processing".
      await Promise.all(
        [...targetStreams.values()].map(
          (stream) =>
            new Promise<void>((resolve) => {
              if (stream.destroyed) {
                resolve();
                return;
              }
              stream.once("close", resolve);
              stream.once("error", () => resolve());
              stream.end();
            }),
        ),
      );

      // Only keep frames that actually made it to disk.
      const written = frames.filter((frame) => existsSync(frame.file));
      return { dir, frames: written, startTs, stopTs, logs };
    },
  };
}
