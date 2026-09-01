import type { RecordingInfo } from "@repo/types";

export interface StartBrowserResult {
  id: string;
  wsEndpoint: string;
  targetId: string;
  /** Set only when the session was started with `timeoutMs`. */
  expiresAt?: number;
}

export interface BrowserInfo {
  id: string;
  connected: boolean;
  targetId: string;
  recording?: RecordingInfo;
  /** Current automatic-stop deadline (epoch ms), absent when there is none. */
  expiresAt?: number;
}

export interface StopBrowserResult {
  recording?: RecordingInfo;
}
