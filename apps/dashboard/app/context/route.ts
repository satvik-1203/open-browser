import { db, schema } from "@repo/db";
import { logger } from "@repo/logger";
import type {
  CreateBrowserContextBody,
  ListBrowserContextsResponse,
} from "@repo/types";
import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import {
  listContexts,
  redactProxy,
  toContextRecord,
} from "@/lib/browser-contexts";

export const runtime = "nodejs";

/** List the caller's contexts. Ownership-scoped, like every other route here. */
export async function GET(request: Request) {
  const authed = await getAuthedUser(request.headers);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await listContexts(authed.userId);
  const body: ListBrowserContextsResponse = {
    contexts: rows.map(toContextRecord),
  };
  return NextResponse.json(body);
}

/**
 * Create an empty context. It starts with no snapshot, so the first session
 * that loads it gets a clean browser — that's the intended flow: create,
 * log in once inside a session, and every session after inherits the login.
 */
export async function POST(request: Request) {
  const authed = await getAuthedUser(request.headers);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as CreateBrowserContextBody;

  const [row] = await db
    .insert(schema.browserContext)
    .values({
      userId: authed.userId,
      name: body.name ?? null,
      proxy: redactProxy(body.proxy),
      fingerprint: body.fingerprint ?? null,
    })
    .returning();

  if (!row) {
    return NextResponse.json({ error: "failed to create context" }, { status: 500 });
  }

  logger.info("browser context created", {
    contextId: row.id,
    userId: authed.userId,
  });
  return NextResponse.json(toContextRecord(row), { status: 201 });
}
