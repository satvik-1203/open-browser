import { logger } from "@repo/logger";
import type { Request, Response } from "express";
import { recordingBodyStream } from "@/services/browser/recordingEvents";

/**
 * Stream one captured response body (addressed by its CDP `requestId`) to the
 * client. Bodies are stored as their own objects and fetched only when a request
 * is inspected, so this is the one path that can move real bytes — it pipes
 * straight from storage without buffering.
 */
export async function getRecordingBody(req: Request, res: Response) {
  const { id, requestId } = req.params;
  if (typeof id !== "string" || typeof requestId !== "string") {
    res.status(404).json({ error: "response body not found" });
    return;
  }

  try {
    const stream = await recordingBodyStream(id, requestId);
    if (!stream) {
      res.status(404).json({ error: "response body not found" });
      return;
    }
    res.setHeader("content-type", "application/octet-stream");
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("recording body lookup failed", { id, requestId, error: message });
    if (!res.headersSent) {
      res.status(500).json({ error: "failed to look up response body" });
    } else {
      res.destroy();
    }
  }
}
