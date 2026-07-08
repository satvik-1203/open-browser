import type { StorageAdapter } from "@/adapters/types";

export interface BrowserServerOptions {
  hostUrl: string;
  /** Storage target for session recordings. Required to use `start({ record: true })`. */
  adapter?: StorageAdapter;
}

export type {
  CookieData,
  GetBrowserResponse,
  ProxyOptions,
  RecordingInfo,
  RecordingStatus,
  S3StorageAdapterDescriptor,
  StartBrowserOptions,
  StartBrowserResponse,
  StorageAdapterDescriptor,
  StopBrowserResponse,
} from "@repo/types";
