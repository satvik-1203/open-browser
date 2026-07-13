import type { ListBrowsersResponse } from "@repo/types";
import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import {
  findOwnedSession,
  listActiveSessions,
  listSessions,
  listSessionsPage,
  toRecord,
} from "@/lib/browser-sessions";

export const runtime = "nodejs";

const MAX_LIMIT = 100;

/**
 * List the caller's browser sessions, most recent first.
 *
 * Query params:
 *  - `id`       — return just that one owned session (exact-id search).
 *  - `limit`    — enable keyset pagination; response carries `nextCursor`.
 *  - `cursor`   — opaque cursor from a previous page's `nextCursor`.
 *  - `recorded` — "1" to restrict to sessions that have a recording.
 *
 * With no params it returns every session (used by the live-browsers view).
 */
export async function GET(request: Request) {
  const authed = await getAuthedUser(request.headers);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);

  // Exact-id search.
  const id = url.searchParams.get("id");
  if (id) {
    const row = await findOwnedSession(id, authed.userId);
    const response: ListBrowsersResponse = {
      sessions: row ? [toRecord(row)] : [],
    };
    return NextResponse.json(response);
  }

  // Live sessions only (uses the (userId, status) index).
  if (url.searchParams.get("active") === "1") {
    const rows = await listActiveSessions(authed.userId);
    const response: ListBrowsersResponse = { sessions: rows.map(toRecord) };
    return NextResponse.json(response);
  }

  const recorded = url.searchParams.get("recorded") === "1";
  const limitParam = url.searchParams.get("limit");

  // Paginated page.
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10);
    const limit = Math.min(
      Math.max(Number.isNaN(parsed) ? 10 : parsed, 1),
      MAX_LIMIT,
    );
    const { rows, nextCursor, total } = await listSessionsPage({
      userId: authed.userId,
      limit,
      recorded,
      cursor: url.searchParams.get("cursor"),
    });
    const response: ListBrowsersResponse = {
      sessions: rows.map(toRecord),
      nextCursor,
      total,
    };
    return NextResponse.json(response);
  }

  // Unpaginated (every session).
  const rows = await listSessions(authed.userId);
  const response: ListBrowsersResponse = { sessions: rows.map(toRecord) };
  return NextResponse.json(response);
}
