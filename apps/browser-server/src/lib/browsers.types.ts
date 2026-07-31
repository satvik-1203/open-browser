import type { RecordingInfo } from "@repo/types";
import type { Browser } from "puppeteer";
import type { Recorder } from "@/services/recording/types";

/**
 * In-memory record for one live browser session. This map is the source of
 * truth for now; a database replaces it later without changing call sites.
 */
export interface BrowserSession {
  id: string;
  browser: Browser;
  targetId: string;
  /** When the session was created (epoch milliseconds). */
  createdAt: number;
  /**
   * Context this session loaded, present only when one was requested.
   *
   * `dir` is this session's *private* copy of the context's Chromium user data
   * directory. Private because Chromium takes a `ProcessSingleton` lock on a
   * profile directory and refuses to start a second browser against one, so
   * concurrent sessions on a context cannot share it — each gets its own copy
   * and, when `persist` is set, the last one to end wins the write-back.
   */
  context?: {
    id: string;
    /** Whether this session writes its profile back when it ends. */
    persist: boolean;
    /** This session's user data directory, removed at teardown either way. */
    dir: string;
  };
  /** Active tab recorder, present only when the session was started with `record`. */
  recorder?: Recorder;
  /** Current recording state, surfaced on get()/stop(). */
  recording?: RecordingInfo;
  /** Guards against double end-handling when an explicit teardown (stop /
   * shutdown) and the browser's `disconnected` event race. */
  endHandled?: boolean;
}
