import type {
  BrowserMetrics,
  BrowserMetricsSortField,
  GetBrowserMetricsResponse,
  SortOrder,
} from "@repo/types";
import { sessions } from "@/lib/browsers";

export interface BrowserMetricsQuery {
  page: number;
  pageSize: number;
  sortBy: BrowserMetricsSortField;
  order: SortOrder;
}

function compare(
  a: BrowserMetrics,
  b: BrowserMetrics,
  sortBy: BrowserMetricsSortField,
): number {
  switch (sortBy) {
    case "cpu":
      return a.cpuPercent - b.cpuPercent;
    case "memory":
      return a.memoryBytes - b.memoryBytes;
    case "createdAt":
      return a.createdAt - b.createdAt;
  }
}

/**
 * Collect resource usage for every live browser, then sort and paginate.
 *
 * Every browser is sampled before sorting because cpu/memory are computed
 * values — you can't order by a metric you haven't measured yet. Browser counts
 * are small, so measuring all of them per request is cheap.
 */
/**
 * Collect resource usage for every live browser, then sort and paginate.
 *
 * Every browser is sampled before sorting because cpu/memory are computed
 * values — you can't order by a metric you haven't measured yet. Browser counts
 * are small, so measuring all of them per request is cheap.
 *
 * Sampling belongs to the runtime: a local browser is a process tree this
 * server can walk, a sandboxed one runs on another machine and reports no
 * usage at all. Unmeasurable is surfaced as zero *with a null pid*, so the
 * caller can tell "idle" from "not observable from here" — this endpoint is how
 * a leaked session gets found, and a fabricated reading would hide one.
 */
export async function getBrowserMetrics(
  query: BrowserMetricsQuery,
): Promise<GetBrowserMetricsResponse> {
  const { page, pageSize, sortBy, order } = query;

  const items: BrowserMetrics[] = await Promise.all(
    [...sessions.values()].map(async (session) => {
      const usage = await session.runtime.usage().catch(() => undefined);
      return {
        id: session.id,
        pid: usage?.pid ?? null,
        createdAt: session.createdAt,
        connected: session.browser.connected,
        cpuPercent: usage?.cpuPercent ?? 0,
        memoryBytes: usage?.memoryBytes ?? 0,
      };
    }),
  );
  const direction = order === "asc" ? 1 : -1;
  items.sort((a, b) => compare(a, b, sortBy) * direction);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return {
    items: pageItems,
    page,
    pageSize,
    total,
    totalPages,
    sortBy,
    order,
  };
}
