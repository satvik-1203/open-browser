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
  userAgent?: string;
  proxy?: ProxyOptions;
}

export interface StartBrowserResponse {
  id: string;
  webSocketDebuggerUrl: string;
  debuggerUrl: string;
}

export interface StopBrowserResponse {
  id: string;
}

export interface GetBrowserResponse {
  id: string;
  connected: boolean;
  webSocketDebuggerUrl: string;
  debuggerUrl: string;
}
