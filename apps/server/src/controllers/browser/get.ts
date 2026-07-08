import type { GetBrowserResponse } from "@repo/types";
import type { Request, Response } from "express";
import { buildDevtoolsUrls } from "@/lib/devtoolsUrls.js";
import { getBrowserInfo } from "@/services/browser/getBrowserInfo.js";

export async function get(req: Request, res: Response) {
  const { id } = req.params;
  const info = typeof id === "string" ? await getBrowserInfo(id) : undefined;

  if (!info) {
    res.status(404).json({ error: "browser not found" });
    return;
  }

  const { webSocketDebuggerUrl, debuggerUrl } = buildDevtoolsUrls(
    req.headers.host,
    info.id,
    info.targetId,
  );

  const response: GetBrowserResponse = {
    id: info.id,
    connected: info.connected,
    webSocketDebuggerUrl,
    debuggerUrl,
  };
  res.json(response);
}
