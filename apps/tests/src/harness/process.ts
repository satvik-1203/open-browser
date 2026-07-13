import { spawn, type ChildProcess } from "node:child_process";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Service {
  child: ChildProcess;
  /** Everything the process has written to stdout/stderr so far. */
  output: () => string;
  stop: () => Promise<void>;
}

/** Spawn a long-running service, capturing its output for diagnostics. */
export function spawnService(
  bin: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
): Service {
  const child = spawn(bin, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let out = "";
  child.stdout?.on("data", (c: Buffer) => (out += c.toString()));
  child.stderr?.on("data", (c: Buffer) => (out += c.toString()));

  const stop = () =>
    new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      const kill = setTimeout(() => child.kill("SIGKILL"), 5000);
      child.once("exit", () => {
        clearTimeout(kill);
        resolve();
      });
      child.kill("SIGTERM");
    });

  return { child, output: () => out, stop };
}

interface WaitOptions {
  timeoutMs?: number;
  /** Treat the response as ready when this returns true (default: res.ok). */
  validate?: (res: Response) => boolean;
  /** If given, fail fast when the process exits before becoming ready. */
  service?: Service;
}

/** Poll an HTTP endpoint until it's ready (or time out). */
export async function waitForHttp(
  url: string,
  { timeoutMs = 60_000, validate = (r) => r.ok, service }: WaitOptions = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "no response";
  while (Date.now() < deadline) {
    if (service && service.child.exitCode !== null) {
      throw new Error(
        `service exited early (code ${service.child.exitCode}):\n${service.output()}`,
      );
    }
    try {
      const res = await fetch(url);
      if (validate(res)) return;
      last = `status ${res.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(300);
  }
  throw new Error(
    `timed out waiting for ${url} (${last})${
      service ? `\n--- output ---\n${service.output()}` : ""
    }`,
  );
}
