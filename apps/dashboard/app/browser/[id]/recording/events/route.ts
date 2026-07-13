import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import { browserServer } from "@/lib/browser-server";
import { findOwnedSession } from "@/lib/browser-sessions";

export const runtime = "nodejs";

/**
 * Stream a session's recording events (ndjson) for owned sessions only. Passes
 * the optional `?kind=` filter through to the browser server, which does the
 * per-line filtering so we never buffer a whole capture.
 */
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

  const kind = new URL(request.url).searchParams.get("kind") ?? undefined;
  const result = await browserServer.getRecordingEvents(row.id, kind);

  return new NextResponse(new Uint8Array(result.body), {
    status: result.status,
    headers: { "content-type": result.contentType },
  });
}
