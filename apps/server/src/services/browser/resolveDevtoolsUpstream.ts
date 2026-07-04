import { browsers } from "@/lib/browsers.js";

export function resolveDevtoolsUpstream(
  id: string,
  targetId?: string,
): string | undefined {
  const browser = browsers.get(id);

  if (!browser) return undefined;
  if (!targetId) return browser.wsEndpoint();

  const port = new URL(browser.wsEndpoint()).port;
  return `ws://127.0.0.1:${port}/devtools/page/${targetId}`;
}
