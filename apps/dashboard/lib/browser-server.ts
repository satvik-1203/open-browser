import http from "node:http";
import https from "node:https";

import type {
  BrowserMetrics,
  GetBrowserMetricsResponse,
  GetBrowserResponse,
  GetRecordingUrlResponse,
  StartBrowserPayload,
  StartBrowserResponse,
  StopBrowserResponse,
} from "@repo/types";

// Config read once from the environment. `BROWSER_SERVER_PUBLIC_URL` is the host
// we send as the `Host` header when proxying, so the browser server builds
// devtools/ws URLs pointing at its own public address — clients then connect CDP
// straight to the browser server, bypassing us.
const browserServerUrl = (
  process.env.BROWSER_SERVER_URL ?? "http://localhost:3001"
).replace(/\/$/, "");
const bypassToken = process.env.BROWSER_SERVER_BYPASS_TOKEN;
const publicUrl = new URL(
  process.env.BROWSER_SERVER_PUBLIC_URL ?? browserServerUrl,
);
const publicHost = publicUrl.host;
// The browser server echoes this into the CDP/ws URLs it returns, so an https
// public address yields wss:// URLs. Sent explicitly (not left to a proxy) so
// the scheme is deterministic.
const publicProto = publicUrl.protocol === "https:" ? "https" : "http";

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// The browser server caps `pageSize` at 100, so collecting every live browser
// takes a walk. The page ceiling is a runaway guard, not an expected limit —
// hitting it is reported as `truncated`, never silently swallowed.
const METRICS_PAGE_SIZE = 100;
const METRICS_MAX_PAGES = 50;

export interface BrowserServerResult<T> {
  status: number;
  /** Parsed JSON body, or a `{ error }` shape on failures. */
  body: T | { error?: string };
}

export interface BrowserServerRawResult {
  status: number;
  /** Raw response bytes (unparsed) — for streamed/non-JSON bodies. */
  body: Buffer;
  contentType: string;
}

/**
 * Low-level request to the browser server. Uses the raw http/https client (not
 * fetch) so we can override the outgoing `Host` header, and injects the shared
 * bypass token so the browser server accepts the call.
 */
function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<BrowserServerResult<T>> {
  return new Promise((resolve, reject) => {
    const target = new URL(path, browserServerUrl);
    const client = target.protocol === "https:" ? https : http;

    const payload =
      METHODS_WITH_BODY.has(method) && body != null
        ? Buffer.from(JSON.stringify(body))
        : undefined;

    const headers: Record<string, string> = {
      host: publicHost,
      "x-forwarded-proto": publicProto,
    };
    if (bypassToken) headers["browser-server-bypass-token"] = bypassToken;
    if (payload) {
      headers["content-type"] = "application/json";
      headers["content-length"] = String(payload.length);
    }

    const req = client.request(target, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed: unknown;
        try {
          parsed = text ? JSON.parse(text) : undefined;
        } catch {
          parsed = undefined;
        }
        resolve({
          status: res.statusCode ?? 502,
          body: parsed as T | { error?: string },
        });
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Like `request`, but returns the raw response bytes instead of parsing JSON —
 * for the recording event stream (ndjson) and response bodies, which the
 * dashboard proxies straight through to the browser rather than reshaping.
 */
function requestRaw(
  method: string,
  path: string,
): Promise<BrowserServerRawResult> {
  return new Promise((resolve, reject) => {
    const target = new URL(path, browserServerUrl);
    const client = target.protocol === "https:" ? https : http;

    const headers: Record<string, string> = {
      host: publicHost,
      "x-forwarded-proto": publicProto,
    };
    if (bypassToken) headers["browser-server-bypass-token"] = bypassToken;

    const req = client.request(target, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 502,
          body: Buffer.concat(chunks),
          contentType: res.headers["content-type"] ?? "application/octet-stream",
        });
      });
    });

    req.on("error", reject);
    req.end();
  });
}

/** Typed client for the browser server's REST surface. */
export const browserServer = {
  start(options: StartBrowserPayload & { id: string }) {
    return request<StartBrowserResponse>("POST", "/browser/start", options);
  },
  stop(id: string) {
    return request<StopBrowserResponse>("POST", "/browser/stop", { id });
  },
  get(id: string) {
    return request<GetBrowserResponse>(
      "GET",
      `/browser/${encodeURIComponent(id)}`,
    );
  },
  getRecordingUrl(id: string, download = false) {
    const suffix = download ? "?download=1" : "";
    return request<GetRecordingUrlResponse>(
      "GET",
      `/browser/${encodeURIComponent(id)}/recording${suffix}`,
    );
  },
  getRecordingEvents(id: string, kind?: string) {
    const suffix = kind ? `?kind=${encodeURIComponent(kind)}` : "";
    return requestRaw(
      "GET",
      `/browser/${encodeURIComponent(id)}/recording/events${suffix}`,
    );
  },
  getRecordingBody(id: string, requestId: string) {
    return requestRaw(
      "GET",
      `/browser/${encodeURIComponent(id)}/recording/bodies/${encodeURIComponent(requestId)}`,
    );
  },
  /**
   * Every live browser's metrics, across all users — the caller MUST scope the
   * result to the requesting user before returning it (session ids grant
   * tokenless CDP access). Walks the browser server's pages itself: ownership
   * filtering happens here, so its pagination can't line up with ours.
   *
   * Paged on `createdAt` rather than the caller's sort field: cpu/memory are
   * sampled per request and reshuffle between calls, which would drop or
   * duplicate rows across page boundaries.
   */
  async listAllBrowserMetrics(): Promise<
    | { ok: true; items: BrowserMetrics[]; truncated: boolean }
    | { ok: false; status: number; error?: string }
  > {
    const items: BrowserMetrics[] = [];

    for (let page = 1; page <= METRICS_MAX_PAGES; page++) {
      const { status, body } = await request<GetBrowserMetricsResponse>(
        "GET",
        `/browser/metrics?page=${page}&pageSize=${METRICS_PAGE_SIZE}&sortBy=createdAt&order=desc`,
      );

      if (status !== 200 || !body || !("items" in body)) {
        return {
          status,
          ok: false,
          error: (body as { error?: string } | undefined)?.error,
        };
      }

      items.push(...body.items);
      if (page >= body.totalPages) return { ok: true, items, truncated: false };
    }

    return { ok: true, items, truncated: true };
  },
};
