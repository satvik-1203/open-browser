import { logger, requestLogger } from "@repo/logger";
import express from "express";

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

app.listen(port, () => {
  logger.info("server started", { port, url: `http://localhost:${port}` });
});
