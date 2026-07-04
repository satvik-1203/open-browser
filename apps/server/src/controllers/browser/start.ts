import type { Request, Response } from "express";
import { LocalStorageRequiresUrlError, startBrowser, type StartBrowserOptions } from "../../services/browser/startBrowser.js";

export async function start(req: Request, res: Response) {
  try {
    const id = await startBrowser(req.body as StartBrowserOptions);
    res.json({ id });
  } catch (err) {
    if (err instanceof LocalStorageRequiresUrlError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}
