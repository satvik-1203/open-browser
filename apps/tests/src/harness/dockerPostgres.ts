import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { Pool } from "pg";

import { PORTS, POSTGRES } from "./config";

const exec = promisify(execFile);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Start a throwaway Postgres in Docker and wait until it accepts connections.
 * Any leftover container from a previous run is removed first, so re-runs are
 * clean. The database is disposable — the harness migrates it fresh each time.
 */
export async function startPostgres(): Promise<void> {
  await exec("docker", ["rm", "-f", POSTGRES.container]).catch(() => {});
  await exec("docker", [
    "run",
    "-d",
    "--name",
    POSTGRES.container,
    "-p",
    `${PORTS.postgres}:5432`,
    "-e",
    `POSTGRES_USER=${POSTGRES.user}`,
    "-e",
    `POSTGRES_PASSWORD=${POSTGRES.password}`,
    "-e",
    `POSTGRES_DB=${POSTGRES.db}`,
    POSTGRES.image,
  ]);
  await waitForReady();
}

async function waitForReady(): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const pool = new Pool({ connectionString: POSTGRES.url });
    try {
      await pool.query("select 1");
      await pool.end();
      return;
    } catch (error) {
      lastError = error;
      await pool.end().catch(() => {});
      await sleep(500);
    }
  }
  throw new Error(`postgres did not become ready: ${String(lastError)}`);
}

/** Remove the container. Safe to call even if it was never started. */
export async function stopPostgres(): Promise<void> {
  await exec("docker", ["rm", "-f", POSTGRES.container]).catch(() => {});
}
