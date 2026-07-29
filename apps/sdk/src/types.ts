export interface BrowserServerOptions {
  hostUrl: string;
  /**
   * API token (from the dashboard) sent as `Authorization: Bearer <token>`.
   * Required when `hostUrl` points at the backend; omit for a direct,
   * unauthenticated connection to the browser server.
   */
  apiToken?: string;
}

export type {
  BrowserContextRecord,
  BrowserContextStatus,
  BrowserMetrics,
  BrowserMetricsSortField,
  CookieData,
  CreateBrowserContextBody,
  FingerprintOptions,
  GetBrowserMetricsResponse,
  ListBrowserContextsResponse,
  OriginStorage,
  GetBrowserResponse,
  GetRecordingUrlResponse,
  GetServerMetricsResponse,
  ProxyOptions,
  RecordingInfo,
  RecordingStatus,
  ServerCpuMetrics,
  ServerMemoryMetrics,
  ServerMetrics,
  SortOrder,
  StartBrowserOptions,
  StartBrowserResponse,
  StopBrowserResponse,
  StorageState,
} from "@repo/types";
