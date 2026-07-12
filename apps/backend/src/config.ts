// Central place to read and validate environment config once at startup.

export const port = Number(process.env.PORT) || 3002;

/** Base URL of the browser server (apps/browser-server) we proxy REST calls to. */
export const browserServerUrl = (
  process.env.BROWSER_SERVER_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

/** Shared secret injected downstream; undefined disables the header (dev only). */
export const browserServerBypassToken =
  process.env.BROWSER_SERVER_BYPASS_TOKEN;

/**
 * Host we send as the `Host` header when proxying, so the browser server builds
 * devtools/ws URLs pointing at its own public address. Clients then connect CDP
 * straight to the browser server, bypassing the backend.
 */
export const browserServerPublicHost = new URL(
  process.env.BROWSER_SERVER_PUBLIC_URL ?? browserServerUrl,
).host;

/**
 * Base URL of the Next.js auth server (apps/dashboard). Used to validate
 * forwarded user sessions via its better-auth `/api/auth/get-session` endpoint.
 */
export const authServerUrl = (
  process.env.AUTH_SERVER_URL ?? "http://localhost:4000"
).replace(/\/$/, "");
