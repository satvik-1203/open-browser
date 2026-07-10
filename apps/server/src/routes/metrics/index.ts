import { Router, type Router as RouterType } from "express";
import { getServer } from "@/controllers/metrics/getServer";

export const metricsRouter: RouterType = Router();

metricsRouter.get("/", getServer);
