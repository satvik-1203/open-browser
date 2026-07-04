import type { GetBrowserResponse } from "@repo/types";
import type { Request, Response } from "express";
import { getBrowserInfo } from "@/services/browser/getBrowserInfo.js";

export async function get(req: Request, res: Response) {
  const { id } = req.params;
  const info = typeof id === "string" ? await getBrowserInfo(id) : undefined;

  if (!info) {
    res.status(404).json({ error: "browser not found" });
    return;
  }

  const host = req.headers.host;
  const webSocketDebuggerUrl = `ws://${host}/browser/${info.id}/devtools`;
  const pageWs = `${host}/browser/${info.id}/page/${info.targetId}/devtools`;
  const debuggerUrl = `http://${host}/browser/${info.id}/devtools/inspector.html?ws=${pageWs}`;

  const response: GetBrowserResponse = {
    id: info.id,
    connected: info.connected,
    webSocketDebuggerUrl,
    debuggerUrl,
  };
  res.json(response);
}
