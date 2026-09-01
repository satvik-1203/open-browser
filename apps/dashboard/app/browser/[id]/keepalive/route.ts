import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import { browserServer } from "@/lib/browser-server";
import { findOwnedSession } from "@/lib/browser-sessions";

export const runtime = "nodejs";

/**
 * Push back the automatic stop on a browser the caller owns.
 *
 * Ownership is checked against the DB before the browser server is touched, the
 * same as stop, so nobody can hold someone else's session open by guessing an
 * id. That matters more here than on a read: a keepalive is the one call that
 * costs the owner money.
 *
 * Nothing is written to the session row. The deadline lives with the browser
 * that is counting down to it, and a copy here would be one more thing to
 * reconcile after a crash for no reader that needs it.
 */
export async function POST(
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

  const { status, body } = await browserServer.keepAlive(row.id);
  return NextResponse.json(body, { status });
}
