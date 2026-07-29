import { logger } from "@repo/logger";
import { NextResponse } from "next/server";

import { commitSnapshot } from "@/lib/browser-contexts";
import { isValidCallback } from "@/lib/callback-auth";

export const runtime = "nodejs";

interface CommitBody {
  /** Version the writer merged its delta onto. */
  fromVersion: number;
  /** Key the merged snapshot was written to. */
  key: string;
  sizeBytes: number;
}

/**
 * Promote a merged snapshot to the context's current version.
 *
 * Conditional on `fromVersion` still being current: a 409 means another session
 * committed first, so this writer's merge was against stale data. The response
 * carries the version that actually won, and the writer re-merges its delta
 * onto that and calls again. Its delta is still valid either way — only the
 * base moved.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isValidCallback(request.headers)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { id } = await params;
  const body = ((await request.json().catch(() => ({}))) ?? {}) as CommitBody;

  if (typeof body.fromVersion !== "number" || !body.key) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const result = await commitSnapshot({
    contextId: id,
    fromVersion: body.fromVersion,
    key: body.key,
    sizeBytes: body.sizeBytes ?? 0,
  });

  if (!result.ok) {
    logger.info("context commit conflicted", {
      contextId: id,
      fromVersion: body.fromVersion,
      currentVersion: result.version,
    });
    return NextResponse.json(
      { error: "version conflict", version: result.version },
      { status: 409 },
    );
  }

  logger.info("context version committed", {
    contextId: id,
    version: result.version,
  });
  return NextResponse.json({ ok: true, version: result.version });
}
