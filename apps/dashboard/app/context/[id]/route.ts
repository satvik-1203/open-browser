import { db, schema } from "@repo/db";
import { logger } from "@repo/logger";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import {
  countWriters,
  findOwnedContext,
  toContextRecord,
} from "@/lib/browser-contexts";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authed = await getAuthedUser(request.headers);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = await findOwnedContext(id, authed.userId);
  if (!row) {
    return NextResponse.json({ error: "context not found" }, { status: 404 });
  }
  const writers = await countWriters([row.id]);
  return NextResponse.json(toContextRecord(row, writers.get(row.id) ?? 0));
}

/**
 * Delete a context.
 *
 * Refused while any live session is still set to write back: it will try to
 * commit on teardown, and deleting out from under it would either resurrect the
 * row or strand the snapshot. Stop those sessions first.
 *
 * The stored snapshots are intentionally left in object storage — this drops
 * the pointer, and a storage lifecycle rule reaps the orphans. Deleting a live
 * profile's bytes synchronously from a request handler is the kind of thing
 * that goes wrong exactly once.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authed = await getAuthedUser(request.headers);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = await findOwnedContext(id, authed.userId);
  if (!row) {
    return NextResponse.json({ error: "context not found" }, { status: 404 });
  }

  // Refused while any live session is still set to write back: it would try to
  // commit onto a row that no longer exists. Readers don't block deletion —
  // they never write.
  const writers = (await countWriters([row.id])).get(row.id) ?? 0;
  if (writers > 0) {
    return NextResponse.json(
      {
        error: `${writers} running session${writers === 1 ? "" : "s"} still writing to this context; stop them first`,
      },
      { status: 409 },
    );
  }

  await db
    .delete(schema.browserContext)
    .where(eq(schema.browserContext.id, id));

  logger.info("browser context deleted", { contextId: id, userId: authed.userId });
  return NextResponse.json({ ok: true });
}
