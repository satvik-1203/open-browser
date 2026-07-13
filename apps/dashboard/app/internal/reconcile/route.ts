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

  logger.warn("browser server restarted; reconciled orphaned sessions", {
    reconciled: settled.length,
    ids: settled.map((row) => row.id),
  });
  return NextResponse.json({ ok: true, reconciled: settled.length });
}
