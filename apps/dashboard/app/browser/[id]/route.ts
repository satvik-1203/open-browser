import { db, schema } from "@repo/db";
import { logger } from "@repo/logger";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import { browserServer } from "@/lib/browser-server";
import { findOwnedSession } from "@/lib/browser-sessions";

export const runtime = "nodejs";

/**
 * Get a browser the caller owns. Proxies live detail (ws URL, connected state)
 * from the browser server. Lazy reconcile: if the browser server no longer knows
 * the session but the DB still has it active, settle the row to `server-error`
 * (a missed end callback) so the two stay consistent.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authed = await getAuthedUser(request.headers);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = await findOwnedSession(id, authed.userId);
  if (!row) {
    return NextResponse.json({ error: "browser not found" }, { status: 404 });
  }

  const { status, body } = await browserServer.get(row.id);

  if (
    status === 404 &&
    (row.status === "running" ||
      row.status === "starting" ||
      row.status === "stopping")
  ) {
    logger.warn("session missing on browser server; marking server-error", {
      id: row.id,
      userId: authed.userId,
      previousStatus: row.status,
    });
    await db
      .update(schema.browserSession)
      .set({
        status: "server-error",
        errorMessage: "browser no longer present on the browser server",
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.browserSession.id, row.id));
  }

  return NextResponse.json(body, { status });
}
