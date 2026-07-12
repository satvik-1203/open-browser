import { decryptToken } from "@repo/crypto";
import { db, schema } from "@repo/db";
import { logger } from "@repo/logger";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";

import { authServer } from "@/services/authServer";

// API tokens minted by the dashboard are prefixed so we can tell them apart
// from a forwarded user session at a glance.
const API_TOKEN_PREFIX = "ob_";

/**
 * Authenticate a request from either credential and expose the result as
 * `req.userId` (+ richer `req.auth`):
 *
 *  1. `Authorization: Bearer ob_…` — a programmatic API token: decrypt it and
 *     confirm the `api_token` row exists, matches the user, and isn't revoked.
 *  2. Otherwise — a logged-in user's session: forward the request's cookies to
 *     the Next.js auth server's `/api/auth/get-session` and trust the user it
 *     returns.
 *
 * Any failure is answered with a flat 401 that never reveals which check failed.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  const bearer =
    typeof header === "string" && header.startsWith("Bearer ")
      ? header.slice("Bearer ".length).trim()
      : undefined;

  // 1. Programmatic API token.
  if (bearer?.startsWith(API_TOKEN_PREFIX)) {
    const identity = await resolveApiToken(bearer);
    if (!identity) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    req.userId = identity.userId;
    req.auth = { type: "api_token", ...identity };
    next();
    return;
  }

  // 2. Forwarded user session, validated remotely by the auth server.
  const session = await authServer.getSession({
    cookie: req.headers.cookie,
    authorization: req.headers.authorization,
  });
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.userId = session.userId;
  req.auth = { type: "session", userId: session.userId };
  next();
}

/** Validate an API token; returns the identity or null (never throws). */
async function resolveApiToken(
  token: string,
): Promise<{ userId: string; tokenId: string } | null> {
  let payload;
  try {
    payload = decryptToken(token);
  } catch {
    return null;
  }

  const [row] = await db
    .select()
    .from(schema.apiToken)
    .where(eq(schema.apiToken.id, payload.tokenId))
    .limit(1);

  if (!row || row.userId !== payload.userId || row.revokedAt !== null) {
    return null;
  }

  // Best-effort "last used" stamp — never block or fail the request on it.
  void db
    .update(schema.apiToken)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiToken.id, row.id))
    .catch((error: unknown) => {
      logger.warn("failed to update apiToken.lastUsedAt", {
        tokenId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return { userId: row.userId, tokenId: row.id };
}
