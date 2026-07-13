import type { ListBrowsersResponse } from "@repo/types";
import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import { listSessions, toRecord } from "@/lib/browser-sessions";

export const runtime = "nodejs";

/** List the caller's browser sessions, most recent first. */
export async function GET(request: Request) {
  const authed = await getAuthedUser(request.headers);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await listSessions(authed.userId);
  const response: ListBrowsersResponse = { sessions: rows.map(toRecord) };
  return NextResponse.json(response);
}
