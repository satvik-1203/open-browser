import type { NextFunction, Request, Response } from "express";
import { logger, type Logger } from "./logger";

export function createRequestLogger(log: Logger = logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    log.info("incoming request", {
      method: req.method,
      path: req.path,
      url: req.originalUrl,
      ip: req.ip,
    });

    res.on("finish", () => {
      log.info("request completed", {
        method: req.method,
        path: req.path,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
      });
    });

    next();
  };
}

export const requestLogger = createRequestLogger();
