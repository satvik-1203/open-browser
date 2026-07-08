import type { GetBrowserResponse } from "@repo/types";
import type { Request, Response } from "express";
import { buildDevtoolsUrls } from "@/lib/devtoolsUrls";
import { getBrowserInfo } from "@/services/browser/getBrowserInfo";

export function get(req: Request, res: Response) {
  const { id } = req.params;
  const info = typeof id === "string" ? getBrowserInfo(id) : undefined;

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
    recording: info.recording,
  };
  res.json(response);
}
