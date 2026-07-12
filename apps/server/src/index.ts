import "dotenv/config";
import { logger, requestLogger } from "@repo/logger";
import express from "express";
import { bypassToken, logBypassTokenStatus } from "@/middleware/bypassToken";
import { browserRouter } from "@/routes/browser/index";
import { metricsRouter } from "@/routes/metrics/index";
import { browserCount } from "@/services/browser/browserCount";
import { closeAllBrowsers } from "@/services/browser/closeAllBrowsers";
import { proxyDevtools } from "@/services/browser/proxyDevtools";
import { resolveDevtoolsUpstream } from "@/services/browser/resolveDevtoolsUpstream";
import { isStorageConfigured } from "@/services/storage/index";

const app = express();
const port = Number(process.env.PORT) || 3001;

// Build the recording storage adapter once at startup so misconfiguration is
// visible at boot rather than on the first record request.
const recordingEnabled = isStorageConfigured();

app.use(requestLogger);
// Gate every route behind the shared bypass token before any handler runs.
app.use(bypassToken);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Hello from Express!" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/browser", browserRouter);
app.use("/metrics", metricsRouter);

const server = app.listen(port, () => {
  logger.info("server started", { port, url: `http://localhost:${port}` });
  logger.info("recording storage", { configured: recordingEnabled });
  logBypassTokenStatus();
});

server.on("upgrade", (req, socket, head) => {
  const match =
    /^\/devtools\/(?:browser\/(?<browserId>[^/]+)|page\/(?<pageId>[^/]+)\/(?<targetId>[^/]+))$/.exec(
      req.url ?? "",
    );
  const id = match?.groups?.browserId ?? match?.groups?.pageId;
  const upstream = id
    ? resolveDevtoolsUpstream(id, match?.groups?.targetId)
    : undefined;

  if (!upstream) {
    socket.destroy();
    return;
  }

  proxyDevtools(upstream, req, socket, head);
});

async function shutdown() {
  logger.info("shutting down, closing all browsers", { count: browserCount() });
  await closeAllBrowsers();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
