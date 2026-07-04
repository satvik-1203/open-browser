import { browsers } from "@/lib/browsers.js";

export interface BrowserInfo {
  id: string;
  connected: boolean;
  targetId: string;
}

export async function getBrowserInfo(
  id: string,
): Promise<BrowserInfo | undefined> {
  const browser = browsers.get(id);
  if (!browser) return undefined;

  const page = (await browser.pages())[0];
  if (!page) return undefined;

  const cdpSession = await page.createCDPSession();
  const { targetInfo } = await cdpSession.send("Target.getTargetInfo");
  await cdpSession.detach();

  return { id, connected: browser.connected, targetId: targetInfo.targetId };
}
