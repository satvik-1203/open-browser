import { db, schema } from "@repo/db";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

/**
 * Revoke a token the caller owns. Revocation is a soft delete (`revokedAt`) so
 * the backend rejects the token on its next use while keeping an audit trail.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [row] = await db
    .update(schema.apiToken)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(schema.apiToken.id, id),
        eq(schema.apiToken.userId, session.user.id),
      ),
    )
    .returning({ id: schema.apiToken.id });

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ id: row.id, revoked: true });
}
