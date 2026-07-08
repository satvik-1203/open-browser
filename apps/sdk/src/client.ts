import type { StorageAdapter } from "@/adapters/types";
import { BrowserServerError } from "@/errors";
import type {
  BrowserServerOptions,
  GetBrowserResponse,
  StartBrowserOptions,
  StartBrowserResponse,
  StopBrowserResponse,
} from "@/types";

export class BrowserServer {
  private readonly hostUrl: string;
  private readonly adapter?: StorageAdapter;

  constructor(options: BrowserServerOptions) {
    this.hostUrl = options.hostUrl.replace(/\/$/, "");
    this.adapter = options.adapter;
  }

  async start(
    options: StartBrowserOptions = {},
  ): Promise<StartBrowserResponse> {
    const body: StartBrowserOptions = { ...options };
    if (options.record) {
      if (!this.adapter) {
        throw new Error(
          "recording requires an adapter configured on BrowserServer",
        );
      }
      body.adapter = this.adapter.serialize();
    }

    return this.request<StartBrowserResponse>("/browser/start", {
      method: "POST",
      body,
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

  private async request<T>(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    const res = await fetch(`${this.hostUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "content-type": "application/json" } : undefined,
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
