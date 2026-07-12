import type { StopBrowserResponse } from "@repo/types";
import type { Request, Response } from "express";
import { stopBrowser } from "@/services/browser/stopBrowser";

export async function stop(req: Request, res: Response) {
  const { id } = req.body as { id?: string };
  const result = id ? await stopBrowser(id) : undefined;

  if (!result || !id) {
    res.status(404).json({ error: "browser not found" });
    return;
  }

  const response: StopBrowserResponse = { id, recording: result.recording };
  res.json(response);
}
