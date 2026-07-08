import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "puppeteer";
import type {
  Capture,
  CaptureFrame,
  Recorder,
  RecordingConfig,
} from "@/services/recording/types";

const DEFAULT_CONFIG: RecordingConfig = {
  quality: 60,
  everyNthFrame: 1,
  maxWidth: 1280,
  maxHeight: 720,
};

/** Name of the CDP log file written inside the capture dir. */
const LOG_FILE_NAME = "cdp.log";

/**
 * CDP domains enabled so their events fire, and the events captured from each.
 * Console output, uncaught exceptions, browser log entries, and network
 * activity together make a useful trace of what the tab did while recorded.
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
  "Network.loadingFailed",
  "Page.frameNavigated",
  "Page.loadEventFired",
] as const;

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
  let frameIndex = 0;

  // Record CDP protocol events as newline-delimited JSON. Best-effort: enabling
  // a domain or an individual event listener must never break the screencast.
  const logLines: string[] = [];
  for (const method of CDP_LOG_EVENTS) {
    // `method` is a runtime-iterated CDP event name; `never` sidesteps the
    // per-event overloads on `on` without widening to `any`.
    client.on(method as never, (params: unknown) => {
      logLines.push(JSON.stringify({ ts: Date.now(), method, params }));
    });
  }
  await Promise.allSettled(
    CDP_LOG_DOMAINS.map((command) => client.send(command)),
  );

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
      try {
        await client.detach();
      } catch {
        // Ignore — session already detached.
      }

      // Flush the captured CDP events next to the frames (trailing newline so
      // the file is valid newline-delimited JSON even when empty).
      const logFile = join(dir, LOG_FILE_NAME);
      const body = logLines.length ? `${logLines.join("\n")}\n` : "";
      await writeFile(logFile, body);

      // Only keep frames that actually made it to disk.
      const written = frames.filter((frame) => existsSync(frame.file));
      return { dir, frames: written, startTs, stopTs, logFile };
    },
  };
}
