export interface DevtoolsUrls {
  webSocketDebuggerUrl: string;
  debuggerUrl: string;
  liveViewUrl: string;
}

/**
 * Build the CDP/devtools URLs for a session. `secure` selects the scheme:
 * `wss`/`https` when the original client reached us over TLS (e.g. a public
 * `https://` deployment behind a terminating proxy), `ws`/`http` otherwise.
 * The inspector's `?ws=` param stays scheme-less on purpose — the DevTools
 * frontend infers ws/wss from the page it was loaded over.
 *
 * Three URLs, three audiences: `webSocketDebuggerUrl` for automation clients,
 * `debuggerUrl` for a human who wants DevTools panels, and `liveViewUrl` for
 * embedding the viewport in someone else's product.
 */
export function buildDevtoolsUrls(
  host: string | undefined,
  id: string,
  targetId: string,
  secure = false,
): DevtoolsUrls {
  const wsScheme = secure ? "wss" : "ws";
  const httpScheme = secure ? "https" : "http";
  const webSocketDebuggerUrl = `${wsScheme}://${host}/devtools/browser/${id}`;
  const pageWs = `${host}/devtools/page/${id}/${targetId}`;
  const debuggerUrl = `${httpScheme}://${host}/browser/${id}/devtools/inspector.html?ws=${pageWs}`;
  const liveViewUrl = `${httpScheme}://${host}/browser/${id}/live`;

  return { webSocketDebuggerUrl, debuggerUrl, liveViewUrl };
}
