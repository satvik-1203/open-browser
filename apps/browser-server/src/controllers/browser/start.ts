import type { StartBrowserPayload, StartBrowserResponse } from "@repo/types";
import type { Request, Response } from "express";
import { buildDevtoolsUrls } from "@/lib/devtoolsUrls";
import { isSecureRequest } from "@/lib/requestProtocol";
import {
  ContextNotStoredError,
  LocalStorageRequiresUrlError,
  RecordingNotConfiguredError,
} from "@/services/browser/errors";
import { startBrowser } from "@/services/browser/startBrowser";

export async function start(req: Request, res: Response) {
  try {
    // The backend mints the session id so it can log the row before this call;
    // fall back to a server-generated id for direct/legacy callers.
    const { id: providedId, ...options } = req.body as StartBrowserPayload;
    const { id, targetId } = await startBrowser(options, providedId);
    const { webSocketDebuggerUrl, debuggerUrl } = buildDevtoolsUrls(
      req.headers.host,
      id,
      targetId,
      isSecureRequest(req),
    );

    const response: StartBrowserResponse = { id, webSocketDebuggerUrl, debuggerUrl };
    res.json(response);
  } catch (err) {
    if (
      err instanceof LocalStorageRequiresUrlError ||
      err instanceof RecordingNotConfiguredError ||
      err instanceof ContextNotStoredError
    ) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}
