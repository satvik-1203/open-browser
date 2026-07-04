import { Router, type Router as RouterType } from "express";
import { get } from "@/controllers/browser/get.js";
import { inspectorAsset } from "@/controllers/browser/inspectorAsset.js";
import { start } from "@/controllers/browser/start.js";
import { stop } from "@/controllers/browser/stop.js";

export const browserRouter: RouterType = Router();

browserRouter.post("/start", start);
browserRouter.post("/stop", stop);
browserRouter.get(/^\/(?<id>[^/]+)\/devtools\/(?<assetPath>.*)$/, inspectorAsset);
browserRouter.get("/:id", get);
