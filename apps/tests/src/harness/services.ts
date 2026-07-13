import path from "node:path";

import { loadAwsCreds } from "./aws";
import {
  BROWSER_SERVER_DIR,
  DASHBOARD_DIR,
  PORTS,
  POSTGRES,
  SECRETS,
  URLS,
} from "./config";
import { spawnService, waitForHttp, type Service } from "./process";

/**
 * Boot the BUILT apps/browser-server (`node dist/index.js`) on the test port and
 * wait for /health. Requires `turbo run build` to have run first (the `test`
 * script does this) — running the compiled output avoids per-request transpile.
 */
export async function startBrowserServer(): Promise<Service> {
  const service = spawnService("node", ["dist/index.js"], BROWSER_SERVER_DIR, {
    PORT: String(PORTS.browserServer),
    BROWSER_SERVER_BYPASS_TOKEN: SECRETS.bypassToken,
    BACKEND_CALLBACK_URL: URLS.dashboard,
    BACKEND_CALLBACK_TOKEN: SECRETS.callbackToken,
    ...loadAwsCreds(),
  });
  await waitForHttp(`${URLS.browserServer}/health`, {
    service,
    timeoutMs: 30_000,
  });
  return service;
}

/**
 * Boot the BUILT apps/dashboard (`next start`) on the test port, pointed at the
 * test Postgres and browser server. Serving a prebuilt app avoids `next dev`'s
 * per-request compilation. Next reads process.env before its .env files, so
 * these overrides win over the committed .env.local / .env.production — in
 * particular DATABASE_URL, so tests never touch the real database. Ready when
 * better-auth's session endpoint responds (which also confirms the DB).
 */
export async function startDashboard(): Promise<Service> {
  const bin = path.join(DASHBOARD_DIR, "node_modules/.bin/next");
  const service = spawnService(
    bin,
    ["start", "-p", String(PORTS.dashboard)],
    DASHBOARD_DIR,
    {
      PORT: String(PORTS.dashboard),
      DATABASE_URL: POSTGRES.url,
      BETTER_AUTH_SECRET: SECRETS.betterAuthSecret,
      BETTER_AUTH_URL: URLS.dashboard,
      API_TOKEN_ENCRYPTION_KEY: SECRETS.apiTokenEncryptionKey,
      BROWSER_SERVER_URL: URLS.browserServer,
      BROWSER_SERVER_PUBLIC_URL: URLS.browserServer,
      BROWSER_SERVER_BYPASS_TOKEN: SECRETS.bypassToken,
      BACKEND_CALLBACK_TOKEN: SECRETS.callbackToken,
      // Present so the auth/email modules initialize; never actually used (no
      // sign-in / email is exercised in the e2e flows).
      RESEND_API_KEY: "re_e2e_dummy",
      RESEND_FROM_EMAIL: "e2e@openbrowser.build",
    },
  );
  await waitForHttp(`${URLS.dashboard}/api/auth/get-session`, {
    service,
    timeoutMs: 120_000,
    validate: (res) => res.status < 500,
  });
  return service;
}
