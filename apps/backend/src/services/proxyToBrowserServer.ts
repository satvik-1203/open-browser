import http from "node:http";
import https from "node:https";

import { logger } from "@repo/logger";
import type { Request, Response } from "express";

import {
  browserServerBypassToken,
  browserServerPublicHost,
  browserServerUrl,
} from "@/config";

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Forward a REST request to the browser server (apps/browser-server), injecting
 * the shared `browser-server-bypass-token`. Uses the raw http/https client (not
 * fetch) so we can override the outgoing `Host` header — the browser server
 * echoes it into the devtools/ws URLs it returns, pointing CDP clients at its
 * public address rather than at the backend.
 */
export function proxyToBrowserServer(req: Request, res: Response) {
  // originalUrl keeps the mount prefix (/browser, /metrics) + query string.
  const target = new URL(req.originalUrl, browserServerUrl);
  const client = target.protocol === "https:" ? https : http;

  const hasBody =
    METHODS_WITH_BODY.has(req.method) &&
    req.body != null &&
    typeof req.body === "object" &&
    Object.keys(req.body as object).length > 0;
  const bodyBuffer = hasBody
    ? Buffer.from(JSON.stringify(req.body))
    : undefined;

  const headers: Record<string, string> = {
    host: browserServerPublicHost,
  };
  if (browserServerBypassToken) {
    headers["browser-server-bypass-token"] = browserServerBypassToken;
  }
  if (bodyBuffer) {
    headers["content-type"] = "application/json";
    headers["content-length"] = String(bodyBuffer.length);
  }

  const upstream = client.request(
    target,
    { method: req.method, headers },
    (proxied) => {
      res.status(proxied.statusCode ?? 502);
      const contentType = proxied.headers["content-type"];
      if (contentType) res.setHeader("content-type", contentType);
      proxied.pipe(res);
    },
  );

  upstream.on("error", (error: Error) => {
    logger.error("proxy to browser server failed", {
      target: target.toString(),
      error: error.message,
    });
    if (!res.headersSent) res.status(502).json({ error: "bad gateway" });
  });

  if (bodyBuffer) upstream.write(bodyBuffer);
  upstream.end();
}
