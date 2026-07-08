/** A single captured screencast frame written to disk. */
export interface CaptureFrame {
  /** Absolute path to the JPEG file. */
  file: string;
  /** Capture time in epoch milliseconds. */
  ts: number;
}

/** The result of a completed capture — timestamped stills on disk. */
export interface Capture {
  /** Temp directory holding the JPEG frames (and later the encoded mp4). */
  dir: string;
  frames: CaptureFrame[];
  /** When recording started (epoch ms). */
  startTs: number;
  /** When recording stopped (epoch ms). */
  stopTs: number;
}

/**
 * Handle to an in-progress tab recording. `stop()` is resilient: if the browser
 * has already gone away (crash/disconnect) it still returns the frames captured
 * so far rather than throwing.
 */
export interface Recorder {
  stop(): Promise<Capture>;
}

/** Tunables for the CDP screencast capture. */
export interface RecordingConfig {
  /** JPEG quality 0-100. */
  quality: number;
  /** Capture every Nth repaint frame (1 = every repaint, the ~fps ceiling). */
  everyNthFrame: number;
  /** Cap the captured frame dimensions; keeps files small. */
  maxWidth: number;
  maxHeight: number;
}
