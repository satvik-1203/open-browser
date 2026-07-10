import type {
  BrowserMetricsSortField,
  GetBrowserMetricsResponse,
  SortOrder,
} from "@repo/types";
import type { Request, Response } from "express";
import {
  getBrowserMetrics,
  type BrowserMetricsQuery,
} from "@/services/metrics/getBrowserMetrics";

const SORT_FIELDS: readonly BrowserMetricsSortField[] = [
  "cpu",
  "memory",
  "createdAt",
];
const SORT_ORDERS: readonly SortOrder[] = ["asc", "desc"];
const MAX_PAGE_SIZE = 100;

/** First value of a query param, since Express can hand back arrays. */
function firstValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

function parsePositiveInt(raw: string): number | undefined {
  if (!/^\d+$/.test(raw)) return undefined;
  const parsed = Number(raw);
  return parsed >= 1 ? parsed : undefined;
}

type ParseResult =
  | { ok: true; query: BrowserMetricsQuery }
  | { ok: false; error: string };

function parseQuery(query: Request["query"]): ParseResult {
  let page = 1;
  const rawPage = firstValue(query.page);
  if (rawPage !== undefined) {
    const parsed = parsePositiveInt(rawPage);
    if (parsed === undefined) return { ok: false, error: "page must be a positive integer" };
    page = parsed;
  }

  let pageSize = 20;
  const rawPageSize = firstValue(query.pageSize);
  if (rawPageSize !== undefined) {
    const parsed = parsePositiveInt(rawPageSize);
    if (parsed === undefined || parsed > MAX_PAGE_SIZE) {
      return { ok: false, error: `pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}` };
    }
    pageSize = parsed;
  }

  let sortBy: BrowserMetricsSortField = "cpu";
  const rawSortBy = firstValue(query.sortBy);
  if (rawSortBy !== undefined) {
    if (!SORT_FIELDS.includes(rawSortBy as BrowserMetricsSortField)) {
      return { ok: false, error: `sortBy must be one of: ${SORT_FIELDS.join(", ")}` };
    }
    sortBy = rawSortBy as BrowserMetricsSortField;
  }

  let order: SortOrder = "desc";
  const rawOrder = firstValue(query.order);
  if (rawOrder !== undefined) {
    if (!SORT_ORDERS.includes(rawOrder as SortOrder)) {
      return { ok: false, error: `order must be one of: ${SORT_ORDERS.join(", ")}` };
    }
    order = rawOrder as SortOrder;
  }

  return { ok: true, query: { page, pageSize, sortBy, order } };
}

export async function getMetrics(req: Request, res: Response) {
  const parsed = parseQuery(req.query);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const response: GetBrowserMetricsResponse = await getBrowserMetrics(parsed.query);
  res.json(response);
}
