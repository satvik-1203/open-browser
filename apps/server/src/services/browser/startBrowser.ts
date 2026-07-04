import { randomUUID } from "node:crypto";
import puppeteer, { type CookieParam } from "puppeteer";
import { browsers } from "../../lib/browsers.js";

export interface StartBrowserOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  url?: string;
  initialCookie?: CookieParam[];
  localstorage?: Record<string, string>;
  userAgent?: string;
  proxy?: string;
}

export class LocalStorageRequiresUrlError extends Error {}

export async function startBrowser(options: StartBrowserOptions): Promise<string> {
  const { headless = true, viewport, url, initialCookie, localstorage, userAgent, proxy } = options;

  if (localstorage && !url) {
    throw new LocalStorageRequiresUrlError("localstorage requires url to set an origin");
  }

  const browser = await puppeteer.launch({
    headless,
    defaultViewport: viewport ?? null,
    args: proxy ? [`--proxy-server=${proxy}`] : [],
  });

  const page = await browser.newPage();

  if (userAgent) await page.setUserAgent(userAgent);
  if (initialCookie?.length) await page.setCookie(...initialCookie);
  if (url) await page.goto(url);
  if (localstorage) {
    await page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        window.localStorage.setItem(key, value);
      }
    }, localstorage);
  }

  const id = randomUUID();
  browsers.set(id, browser);
  return id;
}
