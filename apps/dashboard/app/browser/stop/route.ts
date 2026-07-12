import { db, schema } from "@repo/db";
import { logger } from "@repo/logger";
import type { RecordingStatus, StopBrowserResponse } from "@repo/types";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import { browserServer } from "@/lib/browser-server";
import { findOwnedSession } from "@/lib/browser-sessions";

export const runtime = "nodejs";

/**
 * Stop a browser the caller owns. Ownership is enforced against the DB before we
 * touch the browser server, so a user can't stop someone else's session by id.
 * The browser server also fires its end callback, but we settle the row here too
 * for an immediate, consistent response.
 */
export async function POST(request: Request) {
  const authed = await getAuthedUser(request.headers);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = ((await request.json().catch(() => ({}))) ?? {}) as {
    id?: string;
  };
  const row = id ? await findOwnedSession(id, authed.userId) : undefined;
  if (!row) {
    return NextResponse.json({ error: "browser not found" }, { status: 404 });
  }

  await db
    .update(schema.browserSession)
    .set({ status: "stopping", updatedAt: new Date() })
    .where(eq(schema.browserSession.id, row.id));

  const { status, body } = await browserServer.stop(row.id);

  if (status >= 400) {
    logger.warn("browser stop rejected by browser server", {
      id: row.id,
      userId: authed.userId,
      status,
      error: (body as { error?: string }).error,
    });
    return NextResponse.json(body, { status });
  }

  const recording = (body as StopBrowserResponse).recording;
  const recordingStatus =
    (recording?.status as RecordingStatus | undefined) ?? row.recordingStatus;
  await db
    .update(schema.browserSession)
    .set({
      status: "stopped",
      recordingStatus,
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.browserSession.id, row.id));

  logger.info("browser session stopped", {
    id: row.id,
    userId: authed.userId,
    recordingStatus,
  });
  return NextResponse.json(body, { status });
}
