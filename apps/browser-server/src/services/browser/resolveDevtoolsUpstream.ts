import { sessions } from "@/lib/browsers";

export interface DevtoolsUpstream {
  url: string;
  /** Auth the upstream requires, if any (remote runtimes only). */
  headers?: Record<string, string>;
}

/**
 * Where to forward a devtools websocket for a session.
 *
 * Clients always connect to *this* server and are proxied onward, which is what
 * lets the browser live somewhere else entirely without the caller knowing —
 * and what keeps a sandbox's preview token on the server side instead of
 * handing it to every client that wants a CDP connection.
 */
export function resolveDevtoolsUpstream(
  id: string,
  targetId?: string,
): DevtoolsUpstream | undefined {
  const runtime = sessions.get(id)?.runtime;
  if (!runtime) return undefined;

  return {
    url: targetId ? runtime.pageWsEndpoint(targetId) : runtime.wsEndpoint(),
    headers: runtime.wsHeaders(),
  };
}
