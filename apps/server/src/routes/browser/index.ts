import { Router, type Router as RouterType } from "express";
import { start } from "../../controllers/browser/start.js";
import { stop } from "../../controllers/browser/stop.js";

export const browserRouter: RouterType = Router();

browserRouter.post("/start", start);
browserRouter.post("/stop", stop);
