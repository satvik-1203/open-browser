import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import { browserServer } from "@/lib/browser-server";

export const runtime = "nodejs";

/**
 * Per-browser metrics. Not session-scoped (the browser server returns every live
 * browser), so this is a thin authenticated passthrough. Query params
 * (page/pageSize/sortBy/order) are forwarded as-is.
 */
export async function GET(request: Request) {
  const authed = await getAuthedUser(request.headers);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { search } = new URL(request.url);
  const { status, body } = await browserServer.proxyGet(
    `/browser/metrics${search}`,
  );
  return NextResponse.json(body, { status });
}
