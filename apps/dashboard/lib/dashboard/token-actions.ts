"use server";

import { db, mintApiToken, schema } from "@repo/db";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import type { ApiTokenRecord, CreatedApiToken } from "./types";

/**
 * Server actions for API-key management. These are dashboard-internal CRUD
 * (session-authenticated only), so they live as actions rather than public
 * routes — the `/browser/*` routes stay routes because token holders call those.
 *
 * Thrown errors get sanitized in production, so create/revoke return a typed
 * result object instead, letting the UI show a real message.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/** List the signed-in user's tokens (metadata only — never the raw token). */
export async function listApiTokens(): Promise<ApiTokenRecord[]> {
  const userId = await requireUserId();
  if (!userId) return [];

  const rows = await db
    .select({
      id: schema.apiToken.id,
      name: schema.apiToken.name,
      lastUsedAt: schema.apiToken.lastUsedAt,
      revokedAt: schema.apiToken.revokedAt,
      createdAt: schema.apiToken.createdAt,
    })
    .from(schema.apiToken)
    .where(eq(schema.apiToken.userId, userId))
    .orderBy(desc(schema.apiToken.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Mint a new API token for the signed-in user. The raw token is returned exactly
 * once (see `mintApiToken`) — never stored, so it can't be recovered later.
 */
export async function createApiToken(
  rawName: string,
): Promise<ActionResult<CreatedApiToken>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) return { ok: false, error: "name is required" };

  const minted = await mintApiToken(db, { userId, name });
  return {
    ok: true,
    data: {
      token: minted.token,
      id: minted.id,
      name: minted.name,
      createdAt: minted.createdAt.toISOString(),
    },
  };
}

/**
 * Revoke a token the caller owns. Revocation is a soft delete (`revokedAt`) so
 * the backend rejects the token on its next use while keeping an audit trail.
 */
export async function revokeApiToken(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const [row] = await db
    .update(schema.apiToken)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(schema.apiToken.id, id), eq(schema.apiToken.userId, userId)),
    )
    .returning({ id: schema.apiToken.id });

  if (!row) return { ok: false, error: "not found" };
  return { ok: true, data: { id: row.id } };
}
