import { Router, type Router as RouterType } from "express";
import { get } from "@/controllers/browser/get";
import { inspectorAsset } from "@/controllers/browser/inspectorAsset";
import { start } from "@/controllers/browser/start";
import { stop } from "@/controllers/browser/stop";

export const browserRouter: RouterType = Router();

browserRouter.post("/start", start);
browserRouter.post("/stop", stop);
browserRouter.get(/^\/(?<id>[^/]+)\/devtools\/(?<assetPath>.*)$/, inspectorAsset);
browserRouter.get("/:id", get);
