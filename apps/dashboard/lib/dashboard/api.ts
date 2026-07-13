import type {
  BrowserSessionRecord,
  GetBrowserResponse,
  GetRecordingUrlResponse,
  StartBrowserOptions,
  StartBrowserResponse,
} from "./types";

/**
 * Thin browser-side client for the dashboard's browser API routes. Every call is
 * same-origin and relies on the better-auth session cookie, so no token is sent.
 * On a non-2xx response it throws an Error carrying the server's `error` message.
 *
 * API-key CRUD is not here — it's session-only dashboard state, handled by the
 * server actions in `token-actions.ts`.
 */
async function call<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const text = await res.text();
  const body = (text ? safeParse(text) : undefined) as
    | (T & { error?: string })
    | undefined;

  if (!res.ok) {
    const message =
      (body as { error?: string } | undefined)?.error ??
      `request failed (${res.status})`;
    throw new Error(message);
  }

  return body as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export interface ListBrowsersParams {
  /** Exact-id lookup — returns just that session (or none). */
  id?: string;
  /** Live sessions only (starting/running/stopping). */
  active?: boolean;
  /** Restrict to sessions that have a recording. */
  recorded?: boolean;
  /** Enable keyset pagination; the response carries `nextCursor`. */
  limit?: number;
  /** Cursor from a previous page's `nextCursor`. */
  cursor?: string | null;
}

export const dashboardApi = {
  // --- Browsers ---------------------------------------------------------
  listBrowsers(params: ListBrowsersParams = {}) {
    const qs = new URLSearchParams();
    if (params.id) qs.set("id", params.id);
    if (params.active) qs.set("active", "1");
    if (params.recorded) qs.set("recorded", "1");
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.cursor) qs.set("cursor", params.cursor);
    const query = qs.toString();
    return call<{
      sessions: BrowserSessionRecord[];
      nextCursor?: string | null;
      total?: number;
    }>(`/browser${query ? `?${query}` : ""}`);
  },
  startBrowser(options: StartBrowserOptions) {
    return call<StartBrowserResponse>("/browser/start", {
      method: "POST",
      body: JSON.stringify(options),
    });
  },
  stopBrowser(id: string) {
    return call<{ id: string }>("/browser/stop", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
  },
  getBrowser(id: string) {
    return call<GetBrowserResponse>(`/browser/${encodeURIComponent(id)}`);
  },
  getRecordingUrl(id: string, opts?: { download?: boolean }) {
    const suffix = opts?.download ? "?download=1" : "";
    return call<GetRecordingUrlResponse>(
      `/browser/${encodeURIComponent(id)}/recording${suffix}`,
    );
  },
};
