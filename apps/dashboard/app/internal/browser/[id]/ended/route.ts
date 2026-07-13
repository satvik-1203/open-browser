import { db, schema } from "@repo/db";
import { logger } from "@repo/logger";
import type {
  BrowserSessionEndStatus,
  RecordingStatus,
  SessionEndedPayload,
} from "@repo/types";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { isValidCallback } from "@/lib/callback-auth";

export const runtime = "nodejs";

const END_STATUSES: readonly BrowserSessionEndStatus[] = [
  "stopped",
  "failed",
  "server-error",
];

/**
 * Callback from the browser server when a session ends (clean stop, crash, or
 * server going down). Settles the DB row to its terminal status. Idempotent — a
 * stop that already settled the row just writes the same terminal state again.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isValidCallback(request.headers)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { id } = await params;
  const { status, recording } = ((await request.json().catch(() => ({}))) ??
    {}) as SessionEndedPayload;

  if (!END_STATUSES.includes(status)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const [row] = await db
    .update(schema.browserSession)
    .set({
      status,
      recordingStatus:
        (recording?.status as RecordingStatus | undefined) ?? undefined,
      errorMessage: recording?.error ?? undefined,
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.browserSession.id, id))
    .returning({ id: schema.browserSession.id });

  if (!row) {
    logger.warn("session-ended callback for unknown session", { id, status });
    return NextResponse.json({ error: "browser not found" }, { status: 404 });
  }

  logger.info("session-ended callback settled row", {
    id,
    status,
    recordingStatus: recording?.status,
  });
  return NextResponse.json({ ok: true });
}
