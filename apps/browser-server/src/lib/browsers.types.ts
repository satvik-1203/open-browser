import type { RecordingInfo } from "@repo/types";
import type { Browser } from "puppeteer";
import type { LaunchedBrowser } from "@/services/browser/launchers/index";
import type { Recorder } from "@/services/recording/types";

/**
 * In-memory record for one live browser session. This map is the source of
 * truth for now; a database replaces it later without changing call sites.
 */
export interface BrowserSession {
  id: string;
  /**
   * The host this session's browser runs on — a local process or a remote
   * sandbox. Owns the CDP endpoints, the profile export, and teardown.
   */
  runtime: LaunchedBrowser;
  /** Convenience alias for `runtime.browser` — the same object, not a copy. */
  browser: Browser;
  targetId: string;
  /** When the session was created (epoch milliseconds). */
  createdAt: number;
  /**
   * Context this session loaded, present only when one was requested.
   *
   * Where the profile physically lives is the runtime's business — locally a
   * temp directory, remotely a path inside the sandbox — so the session only
   * records which context it belongs to and whether it writes back. Each
   * session gets its own copy either way: Chromium takes a `ProcessSingleton`
   * lock on a profile directory and refuses to start a second browser against
   * one, so concurrent sessions on a context cannot share it, and when
   * `persist` is set the last one to end wins the write-back.
   */
  context?: {
    id: string;
    /** Whether this session writes its profile back when it ends. */
    persist: boolean;
  };
  /** Active tab recorder, present only when the session was started with `record`. */
  recorder?: Recorder;
  /** Current recording state, surfaced on get()/stop(). */
  recording?: RecordingInfo;
  /** Guards against double end-handling when an explicit teardown (stop /
   * shutdown) and the browser's `disconnected` event race. */
  endHandled?: boolean;
}
