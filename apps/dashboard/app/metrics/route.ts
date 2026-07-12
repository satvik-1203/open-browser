import { NextResponse } from "next/server";

import { getAuthedUser } from "@/lib/api-auth";
import { browserServer } from "@/lib/browser-server";

export const runtime = "nodejs";

/** Server-wide host metrics. Authenticated passthrough to the browser server. */
export async function GET(request: Request) {
  const authed = await getAuthedUser(request.headers);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { status, body } = await browserServer.proxyGet("/metrics");
  return NextResponse.json(body, { status });
}
