import type { GetServerMetricsResponse } from "@repo/types";
import type { Request, Response } from "express";
import { getServerMetrics } from "@/services/metrics/getServerMetrics";

export async function getServer(_req: Request, res: Response) {
  const server = await getServerMetrics();
  const response: GetServerMetricsResponse = { server };
  res.json(response);
}
