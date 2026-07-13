import path from "node:path";

/**
 * Central config for the e2e harness. All values are fixed and self-contained so
 * a run needs nothing from the developer's shell or `.env` files — the harness
 * boots its own Postgres, browser server, and dashboard with these settings.
 */

// cwd is apps/tests when run via `pnpm --filter tests test`.
export const REPO_ROOT = path.resolve(process.cwd(), "../..");
export const BROWSER_SERVER_DIR = path.join(REPO_ROOT, "apps/browser-server");
export const DASHBOARD_DIR = path.join(REPO_ROOT, "apps/dashboard");
export const MIGRATIONS_DIR = path.join(REPO_ROOT, "packages/db/drizzle");

export const PORTS = {
  browserServer: 3011,
  dashboard: 4010,
  postgres: 5433,
} as const;

export const URLS = {
  browserServer: `http://localhost:${PORTS.browserServer}`,
  dashboard: `http://localhost:${PORTS.dashboard}`,
} as const;

/**
 * Shared secrets injected into the spawned services. The bypass + callback
 * tokens must be identical on both sides, and the encryption key must match the
 * one the harness uses to mint API tokens (see `seed.ts`).
 */
export const SECRETS = {
  bypassToken: "e2e-bypass-token",
  callbackToken: "e2e-callback-token",
  betterAuthSecret: "e2e-better-auth-secret-value-0000000000",
  // 64 hex chars = 32 bytes, the format @repo/crypto expects.
  apiTokenEncryptionKey:
    "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
} as const;

export const POSTGRES = {
  container: "openbrowser-e2e-pg",
  image: "postgres:16-alpine",
  user: "test",
  password: "test",
  db: "openbrowser_test",
  get url() {
    return `postgresql://${this.user}:${this.password}@localhost:${PORTS.postgres}/${this.db}`;
  },
} as const;

/** Default seeded user (satvik). Overridable per call for multi-user tests. */
export const TEST_USER = {
  id: "usr_e2e_satvik",
  name: "satvik",
  email: "satvik@e2e.local",
  username: "satvik",
} as const;
