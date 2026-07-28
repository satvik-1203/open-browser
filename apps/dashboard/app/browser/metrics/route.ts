import { logger } from "@repo/logger";
import type {
  BrowserMetrics,
  BrowserMetricsSortField,
  GetBrowserMetricsResponse,
  SortOrder,
} from "@repo/types";
import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import { browserServer } from "@/lib/browser-server";
import { filterOwnedSessionIds } from "@/lib/browser-sessions";

export const runtime = "nodejs";

// A static segment always outranks the sibling `[id]` dynamic segment in the
// app router, so this file — not `/browser/[id]` — serves `/browser/metrics`.
// Without it the literal path is captured as an id and 404s as "browser not
// found", which is what the SDK's `getBrowserMetrics()` used to hit.

const SORT_FIELDS: readonly BrowserMetricsSortField[] = [
  "cpu",
  "memory",
  "createdAt",
];
const SORT_ORDERS: readonly SortOrder[] = ["asc", "desc"];
const MAX_PAGE_SIZE = 100;

function parsePositiveInt(raw: string): number | undefined {
  if (!/^\d+$/.test(raw)) return undefined;
  const parsed = Number(raw);
  return parsed >= 1 ? parsed : undefined;
}

interface MetricsQuery {
  page: number;
  pageSize: number;
  sortBy: BrowserMetricsSortField;
  order: SortOrder;
}

type ParseResult =
  | { ok: true; query: MetricsQuery }
  | { ok: false; error: string };

/** Same params and defaults as the browser server's own `/browser/metrics`. */
function parseQuery(params: URLSearchParams): ParseResult {
  let page = 1;
  const rawPage = params.get("page");
  if (rawPage !== null) {
    const parsed = parsePositiveInt(rawPage);
    if (parsed === undefined) {
      return { ok: false, error: "page must be a positive integer" };
    }
    page = parsed;
  }

  let pageSize = 20;
  const rawPageSize = params.get("pageSize");
  if (rawPageSize !== null) {
    const parsed = parsePositiveInt(rawPageSize);
    if (parsed === undefined || parsed > MAX_PAGE_SIZE) {
      return {
        ok: false,
        error: `pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`,
      };
    }
    pageSize = parsed;
  }

  let sortBy: BrowserMetricsSortField = "cpu";
  const rawSortBy = params.get("sortBy");
  if (rawSortBy !== null) {
    if (!SORT_FIELDS.includes(rawSortBy as BrowserMetricsSortField)) {
      return {
        ok: false,
        error: `sortBy must be one of: ${SORT_FIELDS.join(", ")}`,
      };
    }
    sortBy = rawSortBy as BrowserMetricsSortField;
  }

  let order: SortOrder = "desc";
  const rawOrder = params.get("order");
  if (rawOrder !== null) {
    if (!SORT_ORDERS.includes(rawOrder as SortOrder)) {
      return {
        ok: false,
        error: `order must be one of: ${SORT_ORDERS.join(", ")}`,
      };
    }
    order = rawOrder as SortOrder;
  }

  return { ok: true, query: { page, pageSize, sortBy, order } };
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
 * Live resource usage for the caller's own browsers, paginated and sortable.
 *
 * The browser server's metrics span every user, so they are never proxied
 * through as-is — the ids alone grant tokenless CDP access. We pull the whole
 * live set, drop everything the caller doesn't own, and only then sort and
 * paginate, so page counts describe the caller's browsers rather than the host's.
 *
 * This is also the only view that surfaces a leaked session: it reports what is
 * actually running on the host right now, not what the session log believes.
 */
export async function GET(request: Request) {
  const authed = await getAuthedUser(request.headers);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = parseQuery(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { page, pageSize, sortBy, order } = parsed.query;

  const result = await browserServer.listAllBrowserMetrics();
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "failed to read browser metrics" },
      { status: result.status },
    );
  }
  if (result.truncated) {
    logger.warn("browser metrics truncated at the page ceiling", {
      collected: result.items.length,
      userId: authed.userId,
    });
  }

  const owned = await filterOwnedSessionIds(
    result.items.map((item) => item.id),
    authed.userId,
  );
  const items = result.items.filter((item) => owned.has(item.id));

  const direction = order === "asc" ? 1 : -1;
  items.sort((a, b) => compare(a, b, sortBy) * direction);

  const total = items.length;
  const start = (page - 1) * pageSize;

  const response: GetBrowserMetricsResponse = {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    sortBy,
    order,
  };
  return NextResponse.json(response);
}
