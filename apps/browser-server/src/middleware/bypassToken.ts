import { timingSafeEqual } from "node:crypto";
import { logger } from "@repo/logger";
import type { NextFunction, Request, Response } from "express";

// Name of the header clients must send, and the env var holding the expected
// value. Express lower-cases all incoming header keys.
const HEADER = "browser-server-bypass-token";

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so short-circuit first.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Gate every request behind a shared secret. Clients must send the
 * `browser-server-bypass-token` header matching `BROWSER_SERVER_BYPASS_TOKEN`
 * from the environment. Anything else is answered with a 404 so the server does
 * not reveal that a route exists at all.
 *
 * When `BROWSER_SERVER_BYPASS_TOKEN` is unset the gate is disabled (all requests pass)
 * and a warning is logged at startup — this keeps local dev and tests working
 * without a token. Set the token in every deployed environment.
 */
// The DevTools inspector frontend is loaded by a plain browser (the "Open
// DevTools" link) which can't attach the bypass-token header. Its assets are
// reachable by session id only — the same tokenless surface as the CDP ws URLs
// we already hand out — so let that path through the gate.
const DEVTOOLS_ASSET_PATH = /^\/browser\/[^/]+\/devtools\//;

export function bypassToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.BROWSER_SERVER_BYPASS_TOKEN;

  if (!expected || DEVTOOLS_ASSET_PATH.test(req.path)) {
    next();
    return;
  }

  const provided = req.headers[HEADER];

  if (typeof provided === "string" && tokensMatch(provided, expected)) {
    next();
    return;
  }

  res.status(404).json({ error: "not found" });
}

/**
 * Log once at boot whether the bypass-token gate is active, mirroring how the
 * server reports recording storage configuration.
 */
export function logBypassTokenStatus() {
  if (!process.env.BROWSER_SERVER_BYPASS_TOKEN) {
    logger.warn(
      "BROWSER_SERVER_BYPASS_TOKEN is not set — request authentication is DISABLED; all requests are allowed",
    );
  }
}
