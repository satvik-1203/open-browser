import type { KeepAliveBrowserResponse } from "@repo/types";
import type { Request, Response } from "express";
import { extendDeadline } from "@/services/browser/sessionDeadline";

/**
 * Push a session's automatic stop back by its full timeout.
 *
 * The two failures are told apart on purpose. An unknown id is a 404, because
 * the session is gone and the caller should stop heartbeating at it. A session
 * that exists but was started without `timeoutMs` is a 409, because the caller
 * believes it is holding something open that was never going to close, and
 * silently answering "fine" would hide that until the bill arrived.
 */
export function keepAlive(req: Request, res: Response) {
  const { id } = req.params;
  if (typeof id !== "string") {
    res.status(404).json({ error: "browser not found" });
    return;
  }

  const expiresAt = extendDeadline(id);
  if (expiresAt === undefined) {
    res.status(404).json({ error: "browser not found or has no timeout" });
    return;
  }

  const response: KeepAliveBrowserResponse = { id, expiresAt };
  res.json(response);
}
