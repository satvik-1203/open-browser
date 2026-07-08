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

      // Only keep frames that actually made it to disk.
      const written = frames.filter((frame) => existsSync(frame.file));
      return { dir, frames: written, startTs, stopTs };
    },
  };
}
