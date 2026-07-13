import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import { browserServer } from "@/lib/browser-server";
import { findOwnedSession } from "@/lib/browser-sessions";

export const runtime = "nodejs";

/** Stream one captured response body for owned sessions only. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const authed = await getAuthedUser(request.headers);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id, requestId } = await params;
  const row = await findOwnedSession(id, authed.userId);
  if (!row) {
    return NextResponse.json({ error: "recording not found" }, { status: 404 });
  }

  const result = await browserServer.getRecordingBody(row.id, requestId);
  return new NextResponse(new Uint8Array(result.body), {
    status: result.status,
    headers: { "content-type": result.contentType },
  });
}
