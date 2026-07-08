import { logger, requestLogger } from "@repo/logger";
import express from "express";
import { browserRouter } from "@/routes/browser/index.js";
import { browserCount } from "@/services/browser/browserCount.js";
import { closeAllBrowsers } from "@/services/browser/closeAllBrowsers.js";
import { proxyDevtools } from "@/services/browser/proxyDevtools.js";
import { resolveDevtoolsUpstream } from "@/services/browser/resolveDevtoolsUpstream.js";

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(requestLogger);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Hello from Express!" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/browser", browserRouter);

const server = app.listen(port, () => {
  logger.info("server started", { port, url: `http://localhost:${port}` });
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
