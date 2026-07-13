/** A single captured screencast frame written to disk. */
export interface CaptureFrame {
  /** Absolute path to the JPEG file. */
  file: string;
  /** Capture time in epoch milliseconds. */
  ts: number;
}

/** A CDP event log captured from one target (the page or a sub-frame/worker). */
export interface CaptureLog {
  /** CDP target id the events came from; used as the stored file name. */
  targetId: string;
  /** Absolute path to that target's newline-delimited JSON log on disk. */
  file: string;
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
  /**
   * One CDP log per target that produced events — the main page plus any
   * out-of-process iframes/workers attached during the session. The main
   * target is always present (its file may be empty).
   */
  logs: CaptureLog[];
  /**
   * Newline-delimited JSON log of the browser actions the client drove over CDP
   * (clicks, scrolls, navigations, evaluates, …), captured off the devtools
   * proxy. Absent if no actions flowed through the proxy while recording.
   */
  actionsLog?: string;
}

/**
 * Handle to an in-progress tab recording. `stop()` is resilient: if the browser
 * has already gone away (crash/disconnect) it still returns the frames captured
 * so far rather than throwing.
 */
export interface Recorder {
  /**
   * Record one browser action driven by the client over CDP. Called from the
   * devtools proxy with the client→browser command frame; best-effort and
   * safe to call after `stop()` (a late frame simply no-ops).
   */
  recordAction(method: string, params: unknown): void;
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
