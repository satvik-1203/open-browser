import { browsers } from "@/lib/browsers.js";

export async function closeAllBrowsers(): Promise<void> {
  await Promise.all([...browsers.values()].map((browser) => browser.close()));
  browsers.clear();
}
