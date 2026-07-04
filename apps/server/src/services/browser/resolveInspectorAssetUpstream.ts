import { browsers } from "@/lib/browsers.js";

export function resolveInspectorAssetUpstream(
  id: string,
  assetPath: string,
): string | undefined {
  const browser = browsers.get(id);

  if (!browser) return undefined;

  const port = new URL(browser.wsEndpoint()).port;
  return `http://127.0.0.1:${port}/devtools/${assetPath}`;
}
