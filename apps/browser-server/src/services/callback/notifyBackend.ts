import { logger } from "@repo/logger";
import type { SessionEndedPayload } from "@repo/types";

// The backend exposes secret-gated `/internal/*` endpoints for these callbacks.
// When BACKEND_CALLBACK_URL is unset the callbacks no-op (local dev / tests):
// the backend's boot reconcile plus lazy checks still keep the DB honest.
const HEADER = "x-callback-token";
// Cap each callback so a hung/unreachable backend can't stall a shutdown flush.
const CALLBACK_TIMEOUT_MS = 5000;

function callbackConfig() {
  const url = process.env.BACKEND_CALLBACK_URL?.replace(/\/$/, "");
  if (!url) return undefined;
  return { url, token: process.env.BACKEND_CALLBACK_TOKEN };
}

async function post(path: string, body?: unknown): Promise<void> {
  const config = callbackConfig();
  if (!config) {
    // No backend to notify (local dev / tests). Surface it: an unexpected crash
    // reported through here otherwise vanishes without a trace, leaving the DB
    // row stuck "running" with nothing explaining why.
    logger.debug("backend callback skipped (not configured)", { path });
    return;
  }

  try {
    const res = await fetch(`${config.url}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.token ? { [HEADER]: config.token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn("backend callback rejected", { path, status: res.status });
    } else {
      logger.debug("backend callback delivered", { path, status: res.status });
    }
  } catch (error) {
    logger.warn("backend callback failed", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Same auth and base URL as `post`, but for the two calls that need a reply:
 * reading a context's current version and committing a merged snapshot. Returns
 * the status alongside the body so the caller can act on a 409 (version
 * conflict) rather than treating it as a generic failure.
 */
async function requestJson<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T | undefined } | undefined> {
  const config = callbackConfig();
  if (!config) return undefined;

  try {
    const res = await fetch(`${config.url}${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(config.token ? { [HEADER]: config.token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
    });
    const parsed = (await res.json().catch(() => undefined)) as T | undefined;
    return { status: res.status, body: parsed };
  } catch (error) {
    logger.warn("backend request failed", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/** The context's current version and the key holding it. */
export function fetchContextSlot(
  contextId: string,
): Promise<
  { status: number; body: { version: number; snapshotKey: string | null } | undefined } | undefined
> {
  return requestJson(
    "GET",
    `/internal/context/${encodeURIComponent(contextId)}`,
  );
}

/**
 * Promote a merged snapshot. A 409 means another writer committed first and
 * the body carries the version that won, to re-merge against.
 */
export function commitContextSnapshot(
  contextId: string,
  payload: { fromVersion: number; key: string; sizeBytes: number },
): Promise<
  { status: number; body: { version?: number } | undefined } | undefined
> {
  return requestJson(
    "POST",
    `/internal/context/${encodeURIComponent(contextId)}/commit`,
    payload,
  );
}

/**
 * Log once at boot whether backend callbacks are configured, mirroring how the
 * server reports its bypass-token and recording-storage status. When disabled,
 * session-ended/reconcile callbacks are skipped silently at runtime — the
 * backend still self-heals via its lazy + boot reconcile.
 */
export function logCallbackStatus() {
  logger.info("backend callbacks", { configured: Boolean(callbackConfig()) });
}

/**
 * Tell the backend a session has ended so it can settle the DB row. Returns the
 * delivery promise (which never rejects — failures are logged) so shutdown can
 * await it; runtime callers fire-and-forget.
 */
export function notifySessionEnded(
  id: string,
  payload: SessionEndedPayload,
): Promise<void> {
  return post(`/internal/browser/${encodeURIComponent(id)}/ended`, payload);
}

/**
 * On boot the in-memory session map is empty, so any session the backend still
 * has marked live was orphaned by this restart. Tell the backend to reconcile
 * them (settled as `server-error`).
 */
export function notifyServerStarted(): void {
  void post("/internal/reconcile");
}
