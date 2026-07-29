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
   * Context this session loaded, present only when one was requested. `saveKey`
   * is set only for the session holding the context's write lease; without it
   * teardown skips the snapshot, which is what makes read-only forks safe to
   * run several at a time against one context.
   */
  context?: {
    id: string;
    saveKey?: string;
    /**
     * Origins seeded at start. Carried so teardown can re-read them even if the
     * session navigated away, instead of silently dropping them.
     */
    origins: Set<string>;
  };
  /** Active tab recorder, present only when the session was started with `record`. */
  recorder?: Recorder;
  /** Current recording state, surfaced on get()/stop(). */
  recording?: RecordingInfo;
  /** Guards against double end-handling when an explicit teardown (stop /
   * shutdown) and the browser's `disconnected` event race. */
  endHandled?: boolean;
}
