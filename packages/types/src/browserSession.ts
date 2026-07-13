import type { RecordingInfo, RecordingStatus } from "./recording";

/**
 * Lifecycle of a browser session as tracked by the backend in Postgres.
 *
 *  - `starting`     — row inserted; the browser-server `start` call is in flight.
 *  - `running`      — browser is live.
 *  - `stopping`     — a user-initiated stop is in flight.
 *  - `stopped`      — clean, user-initiated shutdown.
 *  - `failed`       — start threw, or the browser crashed on its own.
 *  - `server-error` — the session died because the browser server went down:
 *                     closed during a graceful shutdown, or orphaned by a
 *                     restart (settled by the boot/lazy reconcile).
 */
export const BROWSER_SESSION_STATUSES = [
  "starting",
  "running",
  "stopping",
  "stopped",
  "failed",
  "server-error",
] as const;

export type BrowserSessionStatus = (typeof BROWSER_SESSION_STATUSES)[number];

/** Terminal statuses a session can be settled to when it ends. */
export type BrowserSessionEndStatus = Extract<
  BrowserSessionStatus,
  "stopped" | "failed" | "server-error"
>;

/** A user-facing browser session record, returned by the backend list/get. */
export interface BrowserSessionRecord {
  id: string;
  status: BrowserSessionStatus;
  recordingStatus: RecordingStatus | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface ListBrowsersResponse {
  sessions: BrowserSessionRecord[];
  /** Opaque cursor for the next page, or null when there are no more. */
  nextCursor?: string | null;
  /** Total matching sessions (paginated requests only). */
  total?: number;
}

/**
 * Internal callback payload: browser-server → backend when a session ends, so
 * the backend can settle the DB row (final status + recording state). Guarded
 * by the shared callback token; unauthenticated calls are ignored.
 */
export interface SessionEndedPayload {
  status: BrowserSessionEndStatus;
  recording?: RecordingInfo;
}
