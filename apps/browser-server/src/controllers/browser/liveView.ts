import type { Request, Response } from "express";
import { liveViewPage } from "@/lib/liveViewPage";
import { getBrowserInfo } from "@/services/browser/getBrowserInfo";

/**
 * Serve the embeddable live view for a session.
 *
 * The target id is resolved here rather than baked into the URL so the URL
 * handed to an embedder stays valid for the life of the session — and so a
 * reconnect after the page's target changed picks up the current one.
 *
 * Interactive by default (the common case is a human taking over a session);
 * `?interactive=false` gives a watch-only stream that swallows no input.
 *
 * `?chrome=false` drops the tab strip and URL bar for a bare viewport — for an
 * embedder who has built their own controls around the iframe.
 */
export function liveView(req: Request, res: Response) {
  const { id } = req.params;
  const info = typeof id === "string" ? getBrowserInfo(id) : undefined;

  if (!info) {
    res.status(404).type("html").send(
      "<!doctype html><meta charset=utf-8><title>Session not found</title>" +
        '<body style="margin:0;height:100vh;display:flex;align-items:center;' +
        "justify-content:center;background:#0b0b0c;color:#8a8a91;" +
        'font:13px system-ui,sans-serif">Session not found</body>',
    );
    return;
  }

  const interactive = req.query.interactive !== "false";
  const chrome = req.query.chrome !== "false";

  // Explicitly framable: this page exists to be embedded, and some proxies
  // default to DENY. Left wide open on purpose — the session id is the secret,
  // the same one that already grants tokenless CDP access.
  res.removeHeader("X-Frame-Options");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");
  // Never cache: the embedded target id is only valid while the session lives.
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(
    liveViewPage({
      sessionId: info.id,
      targetId: info.targetId,
      interactive,
      chrome,
    }),
  );
}
