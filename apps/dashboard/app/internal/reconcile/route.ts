import { db, schema } from "@repo/db";
import { logger } from "@repo/logger";
import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { isValidCallback } from "@/lib/callback-auth";

export const runtime = "nodejs";

// Statuses that imply a live browser on the (now restarted) browser server.
const ACTIVE_STATUSES = ["starting", "running", "stopping"] as const;

/**
 * Callback fired when the browser server boots. Its in-memory session map is
 * empty, so any session the DB still has active was orphaned by the restart —
 * settle them all to `server-error`.
 */
export async function POST(request: Request) {
  if (!isValidCallback(request.headers)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // In development the browser server restarts constantly (hot reload), and each
  // boot would otherwise mark every live session `server-error`. Skip it so local
  // sessions survive a browser-server restart; prod still self-heals.
  if (process.env.NODE_ENV !== "production") {
    logger.info("reconcile skipped (non-production)");
    return NextResponse.json({ ok: true, reconciled: 0, skipped: "dev" });
  }

  const settled = await db
    .update(schema.browserSession)
    .set({
      status: "server-error",
      errorMessage: "orphaned by browser server restart",
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(inArray(schema.browserSession.status, [...ACTIVE_STATUSES]))
    .returning({ id: schema.browserSession.id });

  // Those sessions died without sending a session-ended callback, so any write
  // lease they held is now permanently unreleasable — the context would be
  // unwritable until its TTL ran out. Their snapshots were never written, so
  // the contexts keep their previous version.
  if (settled.length) {
    const freed = await db
      .update(schema.browserContext)
      .set({
        leaseSessionId: null,
        leaseExpiresAt: null,
        leaseSaveKey: null,
        updatedAt: new Date(),
      })
      .where(
        inArray(
          schema.browserContext.leaseSessionId,
          settled.map((row) => row.id),
        ),
      )
      .returning({ id: schema.browserContext.id });
    if (freed.length) {
      logger.warn("released context leases orphaned by restart", {
        contextIds: freed.map((row) => row.id),
      });
    }
  }

  logger.warn("browser server restarted; reconciled orphaned sessions", {
    reconciled: settled.length,
    ids: settled.map((row) => row.id),
  });
  return NextResponse.json({ ok: true, reconciled: settled.length });
}
