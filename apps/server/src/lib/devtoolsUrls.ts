export interface DevtoolsUrls {
  webSocketDebuggerUrl: string;
  debuggerUrl: string;
}

export function buildDevtoolsUrls(
  host: string | undefined,
  id: string,
  targetId: string,
): DevtoolsUrls {
  const webSocketDebuggerUrl = `ws://${host}/devtools/browser/${id}`;
  const pageWs = `${host}/devtools/page/${id}/${targetId}`;
  const debuggerUrl = `http://${host}/browser/${id}/devtools/inspector.html?ws=${pageWs}`;

  return { webSocketDebuggerUrl, debuggerUrl };
}
