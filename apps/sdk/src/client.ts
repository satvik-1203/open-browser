import { BrowserServerError } from "@/errors";
import type {
  BrowserServerOptions,
  GetBrowserResponse,
  GetRecordingUrlResponse,
  StartBrowserOptions,
  StartBrowserResponse,
  StopBrowserResponse,
} from "@/types";

export class BrowserServer {
  private readonly hostUrl: string;

  constructor(options: BrowserServerOptions) {
    this.hostUrl = options.hostUrl.replace(/\/$/, "");
  }

  async start(
    options: StartBrowserOptions = {},
  ): Promise<StartBrowserResponse> {
    return this.request<StartBrowserResponse>("/browser/start", {
      method: "POST",
      body: options,
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
