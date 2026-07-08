import type { RecordingInfo } from "./recording";
import type { StorageAdapterDescriptor } from "./storage";

export interface ProxyOptions {
  server: string;
  username?: string;
  password?: string;
}

export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  expires?: number;
}

export interface StartBrowserOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  url?: string;
  initialCookie?: CookieData[];
  localstorage?: Record<string, string>;
  userAgent?: string;
  proxy?: ProxyOptions;
  /** Record the tab and store it via `adapter` when the session ends. */
  record?: boolean;
  /** Storage target for the recording. Required when `record` is true. */
  adapter?: StorageAdapterDescriptor;
}

export interface StartBrowserResponse {
  id: string;
  webSocketDebuggerUrl: string;
  debuggerUrl: string;
}

export interface StopBrowserResponse {
  id: string;
  recording?: RecordingInfo;
}

export interface GetBrowserResponse {
  id: string;
  connected: boolean;
  webSocketDebuggerUrl: string;
  debuggerUrl: string;
  recording?: RecordingInfo;
}
