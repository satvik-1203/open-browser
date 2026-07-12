import http from "node:http";
import https from "node:https";

import type {
  GetBrowserResponse,
  GetRecordingUrlResponse,
  StartBrowserOptions,
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

export interface BrowserServerResult<T> {
  status: number;
  /** Parsed JSON body, or a `{ error }` shape on failures. */
  body: T | { error?: string };
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

/** Typed client for the browser server's REST surface. */
export const browserServer = {
  start(options: StartBrowserOptions & { id: string }) {
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
  getRecordingUrl(id: string) {
    return request<GetRecordingUrlResponse>(
      "GET",
      `/browser/${encodeURIComponent(id)}/recording`,
    );
  },
  /** Passthrough for the metrics endpoints (not session-scoped). */
  proxyGet(pathWithQuery: string) {
    return request<unknown>("GET", pathWithQuery);
  },
};
