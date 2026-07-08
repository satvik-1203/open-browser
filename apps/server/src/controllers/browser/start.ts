import type { StartBrowserResponse } from "@repo/types";
import type { Request, Response } from "express";
import { buildDevtoolsUrls } from "@/lib/devtoolsUrls.js";
import {
  LocalStorageRequiresUrlError,
  startBrowser,
  type StartBrowserOptions,
} from "@/services/browser/startBrowser.js";

export async function start(req: Request, res: Response) {
  try {
    const { id, targetId } = await startBrowser(
      req.body as StartBrowserOptions,
    );
    const { webSocketDebuggerUrl, debuggerUrl } = buildDevtoolsUrls(
      req.headers.host,
      id,
      targetId,
    );

    const response: StartBrowserResponse = { id, webSocketDebuggerUrl, debuggerUrl };
    res.json(response);
  } catch (err) {
    if (err instanceof LocalStorageRequiresUrlError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}
