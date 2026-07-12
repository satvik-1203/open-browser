import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Capture } from "@/services/recording/types";

export class NoFramesError extends Error {}

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const OUTPUT_NAME = "recording.mp4";
/** Floor for a single frame's on-screen duration (seconds). */
const MIN_FRAME_DURATION = 0.001;

/**
 * Build an ffmpeg concat-demuxer manifest that assigns each still a duration
 * equal to the gap until the next frame (last frame → until stop). The sum of
 * durations equals the wall-clock session length, so the mp4 plays back in real
 * time: idle stretches become one long-held frame, activity becomes dense.
 */
function buildConcatManifest(capture: Capture): string {
  const { frames, startTs, stopTs } = capture;
  const lines = ["ffconcat version 1.0"];

  frames.forEach((frame, i) => {
    // Back-date the first frame to recording start so the total duration equals
    // wall-clock time (covers the startup latency before the first repaint).
    const from = i === 0 ? startTs : frame.ts;
    const to = i + 1 < frames.length ? frames[i + 1]!.ts : stopTs;
    const duration = Math.max(MIN_FRAME_DURATION, (to - from) / 1000);
    lines.push(`file '${basename(frame.file)}'`);
    lines.push(`duration ${duration.toFixed(3)}`);
  });

  // Concat demuxer quirk: the last frame's duration is only honored if the
  // final file is listed once more.
  const last = frames[frames.length - 1];
  if (last) lines.push(`file '${basename(last.file)}'`);

  return `${lines.join("\n")}\n`;
}

function runFfmpeg(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { cwd });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

/**
 * Encode captured frames into an H.264 mp4 with variable frame rate. Returns the
 * absolute path to the produced file (inside the capture dir).
 */
export async function encodeRecording(capture: Capture): Promise<string> {
  if (capture.frames.length === 0) {
    throw new NoFramesError("no frames were captured");
  }

  const manifestPath = join(capture.dir, "frames.txt");
  await writeFile(manifestPath, buildConcatManifest(capture));

  const outputPath = join(capture.dir, OUTPUT_NAME);
  await runFfmpeg(capture.dir, [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "frames.txt",
    "-fps_mode",
    "vfr",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    // H.264 requires even dimensions; Chrome's aspect-preserving scale can be odd.
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-movflags",
    "+faststart",
    OUTPUT_NAME,
  ]);

  return outputPath;
}
