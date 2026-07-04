import type { StartBrowserResponse } from "@repo/types";
import type { Request, Response } from "express";
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
    const host = req.headers.host;

    const webSocketDebuggerUrl = `ws://${host}/browser/${id}/devtools`;
    const pageWs = `${host}/browser/${id}/page/${targetId}/devtools`;
    const debuggerUrl = `http://${host}/browser/${id}/devtools/inspector.html?ws=${pageWs}`;

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
