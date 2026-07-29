import { NextResponse } from "next/server";

import { readSlot } from "@/lib/browser-contexts";
import { isValidCallback } from "@/lib/callback-auth";

export const runtime = "nodejs";

/**
 * Where a writer should merge from: the context's current version and the key
 * holding it.
 *
 * The browser server has no database, so it asks for this immediately before
 * saving rather than using what it was handed at start — by then another
 * session may have committed and moved the context forward. Secret-gated like
 * the other `/internal/*` routes; not ownership-scoped, because the caller is
 * the browser server, not a user.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isValidCallback(request.headers)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { id } = await params;
  const slot = await readSlot(id);
  if (!slot) {
    return NextResponse.json({ error: "context not found" }, { status: 404 });
  }
  return NextResponse.json(slot);
}
