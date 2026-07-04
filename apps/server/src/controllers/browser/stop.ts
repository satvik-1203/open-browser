import type { Request, Response } from "express";
import { stopBrowser } from "@/services/browser/stopBrowser.js";

export async function stop(req: Request, res: Response) {
  const { id } = req.body as { id?: string };
  const stopped = id ? await stopBrowser(id) : false;

  if (!stopped) {
    res.status(404).json({ error: "browser not found" });
    return;
  }

  res.json({ id });
}
