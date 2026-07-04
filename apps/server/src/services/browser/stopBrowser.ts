import { browsers } from "@/lib/browsers.js";

export async function stopBrowser(id: string): Promise<boolean> {
  const browser = browsers.get(id);

  if (!browser) return false;

  await browser.close();
  browsers.delete(id);
  return true;
}
