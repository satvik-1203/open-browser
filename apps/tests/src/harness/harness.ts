import { BrowserServer } from "open-browser-sdk";

import { SECRETS, URLS } from "./config";
import { connectTestDb, runMigrations, type TestDb } from "./db";
import { startPostgres, stopPostgres } from "./dockerPostgres";
import { spawnService, type Service } from "./process";
import { seedUserWithToken, type SeedOverrides, type SeededUser } from "./seed";
import { startBrowserServer, startDashboard } from "./services";

export interface Harness {
  db: TestDb;
  dashboardUrl: string;
  browserServerUrl: string;
  /** Seed a user + API token (defaults to the `satvik` test user). */
  seedUser: (overrides?: SeedOverrides) => Promise<SeededUser>;
  /** An SDK client authenticated as the given API token, pointed at the dashboard. */
  sdkFor: (token: string) => BrowserServer;
  /** Raw authenticated fetch against the dashboard API (for routes the SDK lacks). */
  api: (path: string, token: string, init?: RequestInit) => Promise<Response>;
  /** Restart just the browser server (for crash/reconcile tests). */
  restartBrowserServer: () => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Bring up the full stack: Docker Postgres → migrations → browser server →
 * dashboard. Returns handles the tests use to drive the API and assert on the DB.
 * Everything is torn down by `stop()`.
 */
export async function startHarness(): Promise<Harness> {
  // Mint API tokens with the same key the dashboard child decrypts with.
  process.env.API_TOKEN_ENCRYPTION_KEY = SECRETS.apiTokenEncryptionKey;

  await startPostgres();
  await runMigrations();
  const { db, close: closeDb } = connectTestDb();

  let browser = await startBrowserServer();
  const dashboard = await startDashboard();

  const stop = async () => {
    await dashboard.stop().catch(() => {});
    await browser.stop().catch(() => {});
    await closeDb().catch(() => {});
    await stopPostgres().catch(() => {});
  };

  const restartBrowserServer = async () => {
    await browser.stop().catch(() => {});
    browser = await startBrowserServer();
  };

  return {
    db,
    dashboardUrl: URLS.dashboard,
    browserServerUrl: URLS.browserServer,
    seedUser: (overrides) => seedUserWithToken(db, overrides),
    sdkFor: (token) =>
      new BrowserServer({ hostUrl: URLS.dashboard, apiToken: token }),
    api: (path, token, init) =>
      fetch(`${URLS.dashboard}${path}`, {
        ...init,
        headers: { ...init?.headers, authorization: `Bearer ${token}` },
      }),
    restartBrowserServer,
    stop,
  };
}

// Re-export the underlying spawn helper type for consumers that want it.
export type { Service };
export { spawnService };
