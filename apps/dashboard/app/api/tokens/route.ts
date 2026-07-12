import { encryptToken } from "@repo/crypto";
import { db, schema } from "@repo/db";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

/**
 * Mint a new API token for the signed-in user. The raw token is returned
 * exactly once — it is the AES-GCM encryption of `{ userId, tokenId }` and is
 * never stored, so it can't be recovered later.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const [row] = await db
    .insert(schema.apiToken)
    .values({ userId: session.user.id, name })
    .returning();

  if (!row) {
    return NextResponse.json(
      { error: "failed to create token" },
      { status: 500 },
    );
  }

  const token = encryptToken({ userId: row.userId, tokenId: row.id });

  return NextResponse.json(
    { token, id: row.id, name: row.name, createdAt: row.createdAt },
    { status: 201 },
  );
}

/** List the signed-in user's tokens (metadata only — never the raw token). */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tokens = await db
    .select({
      id: schema.apiToken.id,
      name: schema.apiToken.name,
      lastUsedAt: schema.apiToken.lastUsedAt,
      revokedAt: schema.apiToken.revokedAt,
      createdAt: schema.apiToken.createdAt,
    })
    .from(schema.apiToken)
    .where(eq(schema.apiToken.userId, session.user.id))
    .orderBy(desc(schema.apiToken.createdAt));

  return NextResponse.json({ tokens });
}
