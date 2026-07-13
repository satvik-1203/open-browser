import { db, schema } from "@repo/db";
import { logger } from "@repo/logger";
import type {
  BrowserSessionStatus,
  RecordingStatus,
  StopBrowserResponse,
} from "@repo/types";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import { browserServer } from "@/lib/browser-server";
import { findOwnedSession } from "@/lib/browser-sessions";

export const runtime = "nodejs";

const ACTIVE_STATUSES: readonly BrowserSessionStatus[] = [
  "starting",
  "running",
  "stopping",
];

/**
 * Stop a browser the caller owns. Ownership is enforced against the DB before we
 * touch the browser server, so a user can't stop someone else's session by id.
 * The browser server also fires its end callback, but we settle the row here too
 * for an immediate, consistent response.
 *
 * The row is never left stuck in `stopping`: on success it becomes `stopped`; if
 * the browser server no longer knows the session (404) it's settled to
 * `server-error`; on any other error the optimistic `stopping` is reverted to
 * `running` (the browser is likely still alive) so a later stop/reconcile works.
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
  // Already ended — nothing to stop (mirrors the browser server's repeat-stop 404).
  if (!ACTIVE_STATUSES.includes(row.status)) {
    return NextResponse.json({ error: "browser not found" }, { status: 404 });
  }

  await setStatus(row.id, { status: "stopping" });

  const { status, body } = await browserServer.stop(row.id);

  if (status >= 400) {
    logger.warn("browser stop rejected by browser server", {
      id: row.id,
      userId: authed.userId,
      status,
      error: (body as { error?: string }).error,
    });
    if (status === 404) {
      // Gone from the browser server — a missed end callback; settle it.
      await setStatus(row.id, {
        status: "server-error",
        errorMessage: "browser not present on browser server",
        endedAt: new Date(),
      });
    } else {
      // Unknown failure; don't leave it stuck in `stopping`.
      await setStatus(row.id, { status: "running" });
    }
    return NextResponse.json(body, { status });
  }

  const recording = (body as StopBrowserResponse).recording;
  const recordingStatus =
    (recording?.status as RecordingStatus | undefined) ?? row.recordingStatus;
  await setStatus(row.id, {
    status: "stopped",
    recordingStatus,
    endedAt: new Date(),
  });

  logger.info("browser session stopped", {
    id: row.id,
    userId: authed.userId,
    recordingStatus,
  });
  return NextResponse.json(body, { status });
}

function setStatus(
  id: string,
  fields: {
    status: BrowserSessionStatus;
    recordingStatus?: string | null;
    errorMessage?: string;
    endedAt?: Date;
  },
) {
  return db
    .update(schema.browserSession)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(schema.browserSession.id, id));
}
