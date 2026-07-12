import { logger, requestLogger } from "@repo/logger";
import express from "express";

import { port } from "@/config";
import { authenticate } from "@/middleware/authenticate";
import { proxyToBrowserServer } from "@/services/proxyToBrowserServer";

const app = express();

app.use(requestLogger);

// Health check stays open so load balancers can probe without credentials.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Everything past here requires a valid API token or user session.
app.use(authenticate);
app.use(express.json());

// Proxy the browser server's REST surface. CDP/devtools websockets are NOT
// proxied — the ws URLs returned point clients straight at the browser server.
app.use("/browser", proxyToBrowserServer);
app.use("/metrics", proxyToBrowserServer);

const server = app.listen(port, () => {
  logger.info("backend started", {
    port,
    url: `http://localhost:${port}`,
  });
});

function shutdown() {
  logger.info("backend shutting down");
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
