import type { RecordingInfo } from "@repo/types";

export interface StartBrowserResult {
  id: string;
  wsEndpoint: string;
  targetId: string;
}

export interface BrowserInfo {
  id: string;
  connected: boolean;
  targetId: string;
  recording?: RecordingInfo;
}

export interface StopBrowserResult {
  recording?: RecordingInfo;
}
