import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import { browserServer } from "@/lib/browser-server";
import { findOwnedSession } from "@/lib/browser-sessions";

export const runtime = "nodejs";

/** Resolve a session's recording URL, for owned sessions only. */
export async function GET(
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
    return NextResponse.json({ error: "recording not found" }, { status: 404 });
  }

  const { status, body } = await browserServer.getRecordingUrl(row.id);
  return NextResponse.json(body, { status });
}
