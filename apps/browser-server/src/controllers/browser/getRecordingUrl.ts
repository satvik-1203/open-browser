import { logger } from "@repo/logger";
import type { GetRecordingUrlResponse } from "@repo/types";
import type { Request, Response } from "express";
import { recordingUrl } from "@/services/browser/recordingUrl";

export async function getRecordingUrl(req: Request, res: Response) {
  const { id } = req.params;
  if (typeof id !== "string") {
    res.status(404).json({ error: "recording not found" });
    return;
  }

  try {
    const download = req.query.download === "1" || req.query.download === "true";
    const url = await recordingUrl(
      id,
      download ? { downloadFilename: `recording-${id}.mp4` } : undefined,
    );
    if (!url) {
      res.status(404).json({ error: "recording not found" });
      return;
    }

    const response: GetRecordingUrlResponse = { url };
    res.json(response);
  } catch (err) {
    // The existence check hit storage and failed (auth, network, throttling).
    const message = err instanceof Error ? err.message : String(err);
    logger.error("recording url lookup failed", { id, error: message });
    res.status(500).json({ error: "failed to look up recording" });
  }
}
