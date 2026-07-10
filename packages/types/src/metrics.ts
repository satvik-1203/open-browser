/** Host CPU utilization at the moment the metrics were sampled. */
export interface ServerCpuMetrics {
  /** Number of logical CPU cores. */
  cores: number;
  /** System load averages over 1, 5, and 15 minutes (0 on platforms without support). */
  loadAverage: [number, number, number];
  /**
   * Aggregate CPU utilization across all cores, sampled over a short window.
   * Range 0–100.
   */
  usagePercent: number;
}

/** Host memory utilization at the moment the metrics were sampled. */
export interface ServerMemoryMetrics {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  /** Used memory as a percentage of total. Range 0–100. */
  usagePercent: number;
}

export interface ServerMetrics {
  cpu: ServerCpuMetrics;
  memory: ServerMemoryMetrics;
  /** Process uptime in seconds. */
  uptimeSeconds: number;
}

export interface GetServerMetricsResponse {
  server: ServerMetrics;
}

/** Resource usage for a single live browser, summed across its process tree. */
export interface BrowserMetrics {
  id: string;
  /** Main Chromium process id, or null if it could not be resolved. */
  pid: number | null;
  /** When the session was created (epoch milliseconds). */
  createdAt: number;
  connected: boolean;
  /** CPU utilization summed over the browser's process tree. Range 0–100 per core. */
  cpuPercent: number;
  /** Resident memory summed over the browser's process tree, in bytes. */
  memoryBytes: number;
}

export type BrowserMetricsSortField = "cpu" | "memory" | "createdAt";
export type SortOrder = "asc" | "desc";

export interface GetBrowserMetricsResponse {
  items: BrowserMetrics[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sortBy: BrowserMetricsSortField;
  order: SortOrder;
}
