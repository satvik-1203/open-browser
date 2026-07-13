import "dotenv/config";
import { logger, requestLogger } from "@repo/logger";
import express from "express";
import { bypassToken, logBypassTokenStatus } from "@/middleware/bypassToken";
import { browserRouter } from "@/routes/browser/index";
import { metricsRouter } from "@/routes/metrics/index";
import { browserCount } from "@/services/browser/browserCount";
import { closeAllBrowsers } from "@/services/browser/closeAllBrowsers";
import {
  logCallbackStatus,
  notifyServerStarted,
} from "@/services/callback/notifyBackend";
import { proxyDevtools } from "@/services/browser/proxyDevtools";
import { resolveDevtoolsUpstream } from "@/services/browser/resolveDevtoolsUpstream";
import { isStorageConfigured } from "@/services/storage/index";

const app = express();
const port = Number(process.env.PORT) || 3001;

// Build the recording storage adapter once at startup so misconfiguration is
// visible at boot rather than on the first record request.
const recordingEnabled = isStorageConfigured();

app.use(requestLogger);

// Health check stays open — before the token gate — so load balancers and the
// orchestrating API can probe liveness without the bypass token.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Gate every remaining route behind the shared bypass token before any handler runs.
app.use(bypassToken);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Hello from Express!" });
});

app.use("/browser", browserRouter);
app.use("/metrics", metricsRouter);

const server = app.listen(port, () => {
  logger.info("server started", { port, url: `http://localhost:${port}` });
  logger.info("recording storage", { configured: recordingEnabled });
  logBypassTokenStatus();
  logCallbackStatus();
  // A fresh process has no live sessions — tell the backend to reconcile any it
  // still has marked running (orphaned by this restart) to `failed`.
  notifyServerStarted();
});

server.on("upgrade", (req, socket, head) => {
  const match =
    /^\/devtools\/(?:browser\/(?<browserId>[^/]+)|page\/(?<pageId>[^/]+)\/(?<targetId>[^/]+))$/.exec(
      req.url ?? "",
    );
  const id = match?.groups?.browserId ?? match?.groups?.pageId;
  const targetId = match?.groups?.targetId;
  const kind = targetId ? "page" : "browser";

  if (!id) {
    logger.warn("devtools upgrade rejected: unrecognized path", {
      url: req.url,
    });
    socket.destroy();
    return;
  }

  const upstream = resolveDevtoolsUpstream(id, targetId);
  if (!upstream) {
    // No live session in the in-memory map — it never started, already ended,
    // or the browser crashed and was reaped. The client (e.g. the dashboard
    // live view) sees an immediate hang-up; log so a "stuck on Connecting…"
    // report is traceable to the vanished session rather than silent.
    logger.warn("devtools upgrade rejected: no live session", {
      id,
      targetId,
      kind,
    });
    socket.destroy();
    return;
  }

  logger.info("devtools upgrade proxied", { id, targetId, kind });
  proxyDevtools(upstream, req, socket, head);
});

async function shutdown() {
  logger.info("shutting down, closing all browsers", { count: browserCount() });
  await closeAllBrowsers();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
