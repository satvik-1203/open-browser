import pidtree from "pidtree";
import pidusage from "pidusage";
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

interface TreeUsage {
  cpu: number;
  memory: number;
}

/** Structural subset of pidusage's Stat that we actually consume. */
type PidStat = { cpu: number; memory: number };

function sumUsage(stats: PidStat[]): TreeUsage {
  return stats.reduce(
    (acc, stat) => ({
      cpu: acc.cpu + stat.cpu,
      memory: acc.memory + stat.memory,
    }),
    { cpu: 0, memory: 0 },
  );
}

/**
 * Sample CPU and memory for a set of pids and sum them. Processes can exit
 * between being listed and being sampled, so a failed batch falls back to
 * sampling each pid independently and skipping the ones that have died.
 */
async function usageForPids(pids: number[]): Promise<TreeUsage> {
  if (pids.length === 0) return { cpu: 0, memory: 0 };
  try {
    const stats = await pidusage(pids);
    return sumUsage(Object.values(stats));
  } catch {
    const results = await Promise.all(
      pids.map((pid) => pidusage(pid).catch(() => null)),
    );
    return sumUsage(results.filter((stat) => stat !== null));
  }
}

/** CPU% and memory for one browser, summed across its full process tree. */
async function usageForBrowser(pid: number): Promise<TreeUsage> {
  // `root: true` includes the browser process itself alongside its renderer /
  // GPU children. If the tree can't be walked, fall back to the main pid.
  const treePids = await pidtree(pid, { root: true }).catch(() => [pid]);
  return usageForPids(treePids);
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
export async function getBrowserMetrics(
  query: BrowserMetricsQuery,
): Promise<GetBrowserMetricsResponse> {
  const { page, pageSize, sortBy, order } = query;

  const items: BrowserMetrics[] = await Promise.all(
    [...sessions.values()].map(async (session) => {
      const pid = session.browser.process()?.pid ?? null;
      const { cpu, memory } =
        pid != null ? await usageForBrowser(pid) : { cpu: 0, memory: 0 };

      return {
        id: session.id,
        pid,
        createdAt: session.createdAt,
        connected: session.browser.connected,
        cpuPercent: Math.round(cpu * 100) / 100,
        memoryBytes: memory,
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
