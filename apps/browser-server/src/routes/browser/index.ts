import { Router, type Router as RouterType } from "express";
import { get } from "@/controllers/browser/get";
import { getMetrics } from "@/controllers/browser/getMetrics";
import { getRecordingUrl } from "@/controllers/browser/getRecordingUrl";
import { inspectorAsset } from "@/controllers/browser/inspectorAsset";
import { start } from "@/controllers/browser/start";
import { stop } from "@/controllers/browser/stop";

export const browserRouter: RouterType = Router();

browserRouter.post("/start", start);
browserRouter.post("/stop", stop);
// Must precede "/:id" so the literal path isn't captured as an id.
browserRouter.get("/metrics", getMetrics);
browserRouter.get(/^\/(?<id>[^/]+)\/devtools\/(?<assetPath>.*)$/, inspectorAsset);
browserRouter.get("/:id/recording", getRecordingUrl);
browserRouter.get("/:id", get);
