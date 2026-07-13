import { hashApiToken } from "@repo/crypto";
import { db, schema } from "@repo/db";
import { logger } from "@repo/logger";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";

// API tokens minted by the dashboard are prefixed so we can tell them apart
// from a logged-in user's session at a glance.
const API_TOKEN_PREFIX = "ob_";

export interface AuthedUser {
  userId: string;
  /** The API token used, or null when the caller authenticated with a session. */
  apiTokenId: string | null;
}

/**
 * Resolve the caller of a public API route to a user, from either credential:
 *
 *  1. `Authorization: Bearer ob_…` — a programmatic API token: decrypt it and
 *     confirm the `api_token` row exists, matches the user, and isn't revoked.
 *  2. Otherwise — a signed-in session, validated in-process by better-auth.
 *
 * Returns null when neither check passes. No loopback HTTP — db and the auth
 * adapter are called directly.
 */
export async function getAuthedUser(
  headers: Headers,
): Promise<AuthedUser | null> {
  const header = headers.get("authorization");
  const bearer =
    header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;

  if (bearer?.startsWith(API_TOKEN_PREFIX)) {
    return resolveApiToken(bearer);
  }

  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  return { userId: session.user.id, apiTokenId: null };
}

/** Validate an API token; returns the identity or null (never throws). */
async function resolveApiToken(token: string): Promise<AuthedUser | null> {
  const [row] = await db
    .select()
    .from(schema.apiToken)
    .where(eq(schema.apiToken.tokenHash, hashApiToken(token)))
    .limit(1);

  if (!row || row.revokedAt !== null) {
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

  return { userId: row.userId, apiTokenId: row.id };
}
