import { BrowserServerError } from "@/errors";
import type {
  BrowserContextRecord,
  BrowserMetricsSortField,
  BrowserServerOptions,
  CreateBrowserContextBody,
  GetBrowserMetricsResponse,
  ListBrowserContextsResponse,
  GetBrowserResponse,
  GetRecordingUrlResponse,
  GetServerMetricsResponse,
  SortOrder,
  StartBrowserOptions,
  StartBrowserResponse,
  StopBrowserResponse,
} from "@/types";

export interface BrowserMetricsParams {
  page?: number;
  pageSize?: number;
  sortBy?: BrowserMetricsSortField;
  order?: SortOrder;
}

export class BrowserServer {
  private readonly hostUrl: string;
  private readonly apiToken?: string;

  constructor(options: BrowserServerOptions) {
    this.hostUrl = options.hostUrl.replace(/\/$/, "");
    this.apiToken = options.apiToken;
  }

  /**
   * Start a browser.
   *
   * Pass `contextId` to boot it with a saved profile's cookies and localStorage
   * — the session picks up wherever that profile left off, so an agent logs in
   * once rather than every run. Add `persistContext: true` to save changes back
   * when the session ends; without it the session is a read-only fork and any
   * number can run against the same context at once.
   */
  async start(
    options: StartBrowserOptions = {},
  ): Promise<StartBrowserResponse> {
    return this.request<StartBrowserResponse>("/browser/start", {
      method: "POST",
      body: options,
    });
  }

  /**
   * Create an empty context.
   *
   * It starts with no saved state, so the first session that loads it gets a
   * clean browser. The intended flow is: create it, run one session with
   * `persistContext: true` and log in there, then every later session that
   * passes the same `contextId` inherits that login.
   *
   * Pin `proxy` and `fingerprint` here rather than per-session. Providers that
   * fingerprint tie a login to the network and browser identity it was created
   * on, so a profile whose exit IP or user agent changes between runs gets
   * challenged — which is exactly what those checks are looking for.
   */
  async createContext(
    body: CreateBrowserContextBody = {},
  ): Promise<BrowserContextRecord> {
    return this.request<BrowserContextRecord>("/context", {
      method: "POST",
      body,
    });
  }

  /** Every context belonging to the token's owner. */
  async listContexts(): Promise<BrowserContextRecord[]> {
    const { contexts } =
      await this.request<ListBrowserContextsResponse>("/context");
    return contexts;
  }

  async getContext(id: string): Promise<BrowserContextRecord> {
    return this.request<BrowserContextRecord>(
      `/context/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Delete a context. Throws `BrowserServerError` (409) while a session is
   * still writing to it — stop that session first.
   */
  async deleteContext(id: string): Promise<void> {
    await this.request(`/context/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async stop(id: string): Promise<StopBrowserResponse> {
    return this.request<StopBrowserResponse>("/browser/stop", {
      method: "POST",
      body: { id },
    });
  }

  async get(id: string): Promise<GetBrowserResponse> {
    return this.request<GetBrowserResponse>(
      `/browser/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Resolve the storage URL for a session's recording. Works after `stop()`
   * too, since the URL is derived from the id. The recording's existence is
   * verified in storage — throws `BrowserServerError` (404) if it isn't there.
   */
  async getSessionRecordingUrl(id: string): Promise<string> {
    const { url } = await this.request<GetRecordingUrlResponse>(
      `/browser/${encodeURIComponent(id)}/recording`,
    );
    return url;
  }

  /**
   * Host CPU and memory utilization.
   *
   * Operator-only: served by the browser server itself, not by the per-user API.
   * Point `hostUrl` straight at a browser server — against the dashboard this
   * 404s.
   */
  async getServerMetrics(): Promise<GetServerMetricsResponse> {
    return this.request<GetServerMetricsResponse>("/metrics");
  }

  /**
   * Paginated, sortable resource usage for your live browsers.
   *
   * Reports what is actually running on the host right now, so it's the way to
   * spot a session you started and never stopped. Against the dashboard the
   * result is scoped to the token's owner; against a browser server directly it
   * covers every browser on that host.
   */
  async getBrowserMetrics(
    params: BrowserMetricsParams = {},
  ): Promise<GetBrowserMetricsResponse> {
    const search = new URLSearchParams();
    if (params.page !== undefined) search.set("page", String(params.page));
    if (params.pageSize !== undefined)
      search.set("pageSize", String(params.pageSize));
    if (params.sortBy !== undefined) search.set("sortBy", params.sortBy);
    if (params.order !== undefined) search.set("order", params.order);

    const qs = search.toString();
    return this.request<GetBrowserMetricsResponse>(
      qs ? `/browser/metrics?${qs}` : "/browser/metrics",
    );
  }

  private async request<T>(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (init?.body) headers["content-type"] = "application/json";
    if (this.apiToken) headers.authorization = `Bearer ${this.apiToken}`;

    const res = await fetch(`${this.hostUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });

    const payload = await res.json().catch(() => undefined);

    if (!res.ok) {
      const message =
        (payload as { error?: string } | undefined)?.error ?? res.statusText;
      throw new BrowserServerError(message, res.status);
    }

    return payload as T;
  }
}
