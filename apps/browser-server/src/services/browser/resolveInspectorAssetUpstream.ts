import { sessions } from "@/lib/browsers";

export interface InspectorAssetUpstream {
  url: string;
  /** Auth the upstream requires, if any (remote runtimes only). */
  headers?: Record<string, string>;
}

/**
 * Where to fetch one of Chrome's bundled DevTools frontend assets for a session.
 *
 * Goes through the runtime rather than picking a port out of the CDP ws URL: a
 * sandboxed browser is reached through a proxy whose URL carries no port, so
 * that derivation produced `http://127.0.0.1:/devtools/…` and every asset
 * failed — the inspector link was dead in any remote deployment.
 */
export function resolveInspectorAssetUpstream(
  id: string,
  assetPath: string,
): InspectorAssetUpstream | undefined {
  const runtime = sessions.get(id)?.runtime;

  if (!runtime) return undefined;

  return {
    url: `${runtime.httpEndpoint().replace(/\/$/, "")}/devtools/${assetPath}`,
    headers: runtime.wsHeaders(),
  };
}
