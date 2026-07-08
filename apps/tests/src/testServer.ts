import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_DIR = fileURLToPath(new URL("../../server", import.meta.url));
const TSX_BIN = path.join(SERVER_DIR, "node_modules", ".bin", "tsx");

export interface TestServer {
  baseUrl: string;
  stop: () => Promise<void>;
}

export async function startTestServer(port: number): Promise<TestServer> {
  const child = spawn(TSX_BIN, ["src/index.ts"], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  const baseUrl = `http://localhost:${port}`;

  try {
    await waitForHealth(baseUrl, child);
  } catch (err) {
    child.kill("SIGKILL");
    throw new Error(`${(err as Error).message}\n--- server output ---\n${output}`);
  }

  const stop = () =>
    new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
    });

  return { baseUrl, stop };
}

async function waitForHealth(baseUrl: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server process exited early with code ${child.exitCode}`);
    }

    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch (err) {
      lastError = err;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`server did not become healthy in time: ${String(lastError)}`);
}
