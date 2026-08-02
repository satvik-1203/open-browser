import type { FingerprintOptions } from "./fingerprint";
import type { RecordingInfo } from "./recording";

export interface ProxyOptions {
  server: string;
  username?: string;
  password?: string;
}

export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  expires?: number;
}

export interface StartBrowserOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  url?: string;
  initialCookie?: CookieData[];
  localstorage?: Record<string, string>;
  /**
   * @deprecated Use `fingerprint.userAgent`. A bare UA override contradicts the
   * client hints the browser still sends; `fingerprint` keeps them coherent.
   * Still honoured, and treated as `fingerprint.userAgent` when that is unset.
   */
  userAgent?: string;
  /**
   * Browser identity (UA + client hints + languages + timezone). When the
   * session loads a context, the context's stored fingerprint is used and this
   * is ignored — a context has to present the same browser every time.
   */
  fingerprint?: FingerprintOptions;
  proxy?: ProxyOptions;
  /**
   * Load cookies + localStorage from this context before the session starts.
   * The context's pinned proxy and fingerprint are applied with it.
   */
  contextId?: string;
  /**
   * Save the session's cookies + localStorage back to `contextId` when it ends.
   * Defaults to false: without it the session is a read-only fork of the
   * context and can run alongside others on the same context.
   */
  persistContext?: boolean;
  /**
   * Record the tab and store it when the session ends. Storage is configured on
   * the server; recording fails if the server has no storage configured.
   */
  record?: boolean;
}

/**
 * Context wiring resolved by the backend and handed to the browser server,
 * which has no database of its own. The backend owns the context row, holds
 * the write lease, and picks both keys up front so the browser server only ever
 * does storage I/O.
 */
export interface ResolvedContext {
  id: string;
  /** Snapshot to hydrate from. Absent for a context that has never been saved. */
  loadKey?: string;
  /**
   * Whether this session writes its changes back when it ends. Several writers
   * on one context are allowed: each writes back only what it changed relative
   * to the snapshot it loaded, merged onto the current version. The write key
   * is chosen at save time, not here — by then other sessions may have moved
   * the context forward.
   */
  persist?: boolean;
}

/** What the backend actually POSTs to the browser server's `/browser/start`. */
export interface StartBrowserPayload extends Omit<StartBrowserOptions, "contextId" | "persistContext"> {
  /** Minted by the backend so a failed start is still logged. */
  id?: string;
  context?: ResolvedContext;
}

export interface StartBrowserResponse {
  id: string;
  webSocketDebuggerUrl: string;
  debuggerUrl: string;
  /**
   * Embeddable page showing just the browser's viewport — the URL to drop into
   * an `<iframe>`. Interactive by default; append `?interactive=false` for a
   * read-only stream. Distinct from `debuggerUrl`, which is Chrome's full
   * DevTools frontend (panels and all).
   */
  liveViewUrl: string;
}

export interface StopBrowserResponse {
  id: string;
  recording?: RecordingInfo;
}

export interface GetRecordingUrlResponse {
  /** Resolvable URL to the session's recording in the server's storage. */
  url: string;
}

export interface GetBrowserResponse {
  id: string;
  connected: boolean;
  webSocketDebuggerUrl: string;
  debuggerUrl: string;
  /** Embeddable viewport-only page — see `StartBrowserResponse.liveViewUrl`. */
  liveViewUrl: string;
  recording?: RecordingInfo;
}
