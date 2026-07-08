import { sessions } from "@/lib/browsers";

export function resolveInspectorAssetUpstream(
  id: string,
  assetPath: string,
): string | undefined {
  const browser = sessions.get(id)?.browser;

  if (!browser) return undefined;

  const port = new URL(browser.wsEndpoint()).port;
  return `http://127.0.0.1:${port}/devtools/${assetPath}`;
}
