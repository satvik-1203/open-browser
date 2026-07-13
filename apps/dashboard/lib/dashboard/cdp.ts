import type { GetBrowserResponse } from "./types";

/**
 * Minimal Chrome DevTools Protocol client over a browser WebSocket. Speaks the
 * JSON-RPC framing CDP uses (`{ id, method, params }` → `{ id, result|error }`,
 * plus unsolicited `{ method, params }` events). Enough to drive a live
 * screencast and forward input — not a general-purpose CDP library.
 */
export class CdpConnection {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private listeners = new Map<string, Set<(params: unknown) => void>>();
  private opened: Promise<void>;
  private closed = false;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve(), { once: true });
      this.ws.addEventListener(
        "error",
        () => reject(new Error("CDP socket error")),
        { once: true },
      );
    });

    // Surface unexpected drops (e.g. the browser server hanging up because the
    // session is gone, or the tab crashing mid-stream) — these are what make a
    // live view silently freeze on "Connecting…". A deliberate close() sets
    // `closed` first, so those stay quiet.
    this.ws.addEventListener("close", (ev: CloseEvent) => {
      if (!this.closed) {
        console.warn(
          `[cdp] socket closed unexpectedly (code ${ev.code})`,
          ev.reason || "",
        );
      }
    });
    this.ws.addEventListener("error", () => {
      if (!this.closed) console.warn("[cdp] socket error", url);
    });

    this.ws.addEventListener("message", (ev: MessageEvent) => {
      let msg: {
        id?: number;
        method?: string;
        params?: unknown;
        result?: unknown;
        error?: { message?: string };
      };
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }

      if (typeof msg.id === "number" && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message ?? "CDP error"));
        else p.resolve(msg.result);
      } else if (msg.method) {
        this.listeners.get(msg.method)?.forEach((cb) => cb(msg.params));
      }
    });
  }

  /** Resolves once the socket is open (or rejects if it errored first). */
  ready(): Promise<void> {
    return this.opened;
  }

  /** Send a CDP command; resolves with its `result`. */
  send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
    return new Promise<T>((resolve, reject) => {
      if (this.closed || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("CDP socket not open"));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Fire-and-forget send that never rejects (for high-frequency input). */
  notify(method: string, params: Record<string, unknown> = {}): void {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
  }

  /** Subscribe to a CDP event; returns an unsubscribe fn. */
  on(method: string, cb: (params: unknown) => void): () => void {
    let set = this.listeners.get(method);
    if (!set) {
      set = new Set();
      this.listeners.set(method, set);
    }
    set.add(cb);
    return () => set!.delete(cb);
  }

  close(): void {
    this.closed = true;
    this.pending.clear();
    try {
      this.ws.close();
    } catch {
      // Already closing/closed.
    }
  }
}

/**
 * Derive the page-target CDP WebSocket URL from a GetBrowser response. The
 * browser endpoint gives us the scheme + host (`ws://host/devtools/browser/id`),
 * and the targetId is embedded in the inspector `debuggerUrl`'s `ws=` param
 * (`…/devtools/page/{id}/{targetId}`) — we connect straight to the page target.
 */
export function pageWebSocketUrl(info: GetBrowserResponse): string | null {
  try {
    const browserWs = new URL(info.webSocketDebuggerUrl);
    const origin = `${browserWs.protocol}//${browserWs.host}`;

    const inspector = new URL(info.debuggerUrl);
    const wsParam = inspector.searchParams.get("ws");
    if (!wsParam) return null;
    // wsParam is host-relative and scheme-less: `host/devtools/page/id/target`.
    const path = wsParam.slice(wsParam.indexOf("/devtools/"));
    if (!path.startsWith("/devtools/page/")) return null;
    return `${origin}${path}`;
  } catch {
    return null;
  }
}

/** Screencast frame metadata (subset we use for input coordinate mapping). */
export interface ScreencastMetadata {
  deviceWidth: number;
  deviceHeight: number;
  pageScaleFactor: number;
  offsetTop: number;
  scrollOffsetX: number;
  scrollOffsetY: number;
}

export interface ScreencastFrame {
  data: string;
  sessionId: number;
  metadata: ScreencastMetadata;
}
