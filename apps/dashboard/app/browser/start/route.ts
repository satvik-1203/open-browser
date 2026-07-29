import { randomUUID } from "node:crypto";

import { db, schema } from "@repo/db";
import { logger } from "@repo/logger";
import type { ResolvedContext, StartBrowserOptions } from "@repo/types";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import {
  acquireContext,
  ContextInUseError,
  findOwnedContext,
  releaseContext,
} from "@/lib/browser-contexts";
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

  // Resolve the context before logging the row, so a bad contextId or a busy
  // context fails cleanly without leaving a phantom session behind.
  let context: ResolvedContext | undefined;
  if (options.contextId) {
    const row = await findOwnedContext(options.contextId, authed.userId);
    if (!row) {
      return NextResponse.json({ error: "context not found" }, { status: 404 });
    }
    try {
      context = await acquireContext(row, id, options.persistContext === true);
    } catch (error) {
      if (error instanceof ContextInUseError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }
    // The context's pinned identity wins over per-session options: a profile
    // that changes browser or exit IP between runs is what gets it challenged.
    if (row.proxy) options.proxy = { ...row.proxy, ...options.proxy };
    if (row.fingerprint) options.fingerprint = row.fingerprint;
  }

  await db.insert(schema.browserSession).values({
    id,
    userId: authed.userId,
    apiTokenId: authed.apiTokenId,
    status: "starting",
    contextId: context?.id ?? null,
    contextPersist: context ? (context.saveKey ? "write" : "read") : null,
    options: redactOptions(options),
    recordingStatus: options.record ? "recording" : "none",
  });

  try {
    // `contextId`/`persistContext` are the caller's request; the browser server
    // gets the resolved `context` (which keys to read and write) instead.
    const payload = { ...options, id, context };
    delete payload.contextId;
    delete payload.persistContext;
    const { status, body } = await browserServer.start(payload);

    if (status >= 400) {
      const error = (body as { error?: string }).error;
      logger.warn("browser start rejected by browser server", {
        id,
        userId: authed.userId,
        status,
        error,
      });
      // The browser never launched, so nothing will ever send the session-ended
      // callback that normally releases the lease. Drop it here or the context
      // stays unwritable until the TTL expires hours from now.
      if (context?.saveKey) await releaseContext(context.id, id);
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
    if (context?.saveKey) await releaseContext(context.id, id);
    await markStartFailed(id, "bad gateway");
    return NextResponse.json({ error: "bad gateway" }, { status: 502 });
  }
}
