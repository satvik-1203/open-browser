import type { ProxyOptions } from "./browser";
import type { FingerprintOptions } from "./fingerprint";

/**
 * Lifecycle of a stored browser context (a reusable profile).
 *
 *  - `ready`   — a snapshot is stored and can be loaded.
 *  - `saving`  — a session that held this context ended and its snapshot is
 *                being written; the previous version is still loadable.
 *  - `failed`  — the last save failed. The previous version (if any) is still
 *                loadable; `errorMessage` says why the save was dropped.
 *
 * A freshly created context starts at `ready` with no snapshot — loading it is
 * a no-op that yields a clean browser, which is exactly what you want for the
 * "create a context, log in once, reuse forever" flow.
 */
export const BROWSER_CONTEXT_STATUSES = ["ready", "saving", "failed"] as const;

export type BrowserContextStatus = (typeof BROWSER_CONTEXT_STATUSES)[number];

/** A user-facing context record. Never carries the snapshot itself. */
export interface BrowserContextRecord {
  id: string;
  name: string | null;
  status: BrowserContextStatus;
  /** Bumped on every successful save; `0` before the first one. */
  version: number;
  /** Size of the stored snapshot in bytes, or null before the first save. */
  sizeBytes: number | null;
  /**
   * How many live sessions are currently set to write back to this context.
   * Several are allowed — their changes are merged, not overwritten — so this
   * is informational, not a lock.
   */
  writers: number;
  /** Pinned identity every session on this context presents. */
  fingerprint: FingerprintOptions | null;
  errorMessage: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBrowserContextBody {
  name?: string;
  /**
   * Pinned to the context rather than the session. Google (and most providers
   * that fingerprint) tie a session to the network and UA it was minted on, so
   * a context that moves between exits gets challenged. Sessions started with
   * this context inherit these unless they pass their own.
   */
  proxy?: ProxyOptions;
  fingerprint?: FingerprintOptions;
}

export interface ListBrowserContextsResponse {
  contexts: BrowserContextRecord[];
}
