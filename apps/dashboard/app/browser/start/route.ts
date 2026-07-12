import { randomUUID } from "node:crypto";

import { db, schema } from "@repo/db";
import { logger } from "@repo/logger";
import type { StartBrowserOptions } from "@repo/types";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import { browserServer } from "@/lib/browser-server";
import { markStartFailed, redactOptions } from "@/lib/browser-sessions";

export const runtime = "nodejs";

/**
 * Start a browser: log the session as `starting`, drive the browser server,
 * then settle the row to `running` (or `failed`). We mint the id so a failed
 * start is still recorded. The returned ws URL points at the browser server, so
 * the caller connects CDP directly.
 */
export async function POST(request: Request) {
  const authed = await getAuthedUser(request.headers);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const options = ((await request.json().catch(() => ({}))) ??
    {}) as StartBrowserOptions;
  const id = randomUUID();

  await db.insert(schema.browserSession).values({
    id,
    userId: authed.userId,
    apiTokenId: authed.apiTokenId,
    status: "starting",
    options: redactOptions(options),
    recordingStatus: options.record ? "recording" : "none",
  });

  try {
    const { status, body } = await browserServer.start({ ...options, id });

    if (status >= 400) {
      const error = (body as { error?: string }).error;
      logger.warn("browser start rejected by browser server", {
        id,
        userId: authed.userId,
        status,
        error,
      });
      await markStartFailed(id, error);
      return NextResponse.json(body, { status });
    }

    await db
      .update(schema.browserSession)
      .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.browserSession.id, id));

    logger.info("browser session running", { id, userId: authed.userId });
    return NextResponse.json(body);
  } catch (error) {
    logger.error("browser start failed", {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    await markStartFailed(id, "bad gateway");
    return NextResponse.json({ error: "bad gateway" }, { status: 502 });
  }
}
