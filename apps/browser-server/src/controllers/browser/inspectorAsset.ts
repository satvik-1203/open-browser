import type { Request, Response } from "express";
import { resolveInspectorAssetUpstream } from "@/services/browser/resolveInspectorAssetUpstream";

export async function inspectorAsset(req: Request, res: Response) {
  const { id, assetPath } = req.params;
  const target =
    typeof id === "string" && typeof assetPath === "string"
      ? resolveInspectorAssetUpstream(id, assetPath)
      : undefined;

  if (!target) {
    res.status(404).json({ error: "browser not found" });
    return;
  }

  const query = req.url.includes("?")
    ? req.url.slice(req.url.indexOf("?"))
    : "";
  const upstream = await fetch(`${target.url}${query}`, {
    ...(target.headers ? { headers: target.headers } : {}),
  });

  res.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.setHeader("content-type", contentType);
  res.send(Buffer.from(await upstream.arrayBuffer()));
}
