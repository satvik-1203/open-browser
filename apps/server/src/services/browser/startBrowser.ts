import { randomUUID } from "node:crypto";
import puppeteer, { type CookieData } from "puppeteer";
import { browsers } from "@/lib/browsers.js";

export interface ProxyOptions {
  server: string;
  username?: string;
  password?: string;
}

export interface StartBrowserOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  url?: string;
  initialCookie?: CookieData[];
  localstorage?: Record<string, string>;
  userAgent?: string;
  proxy?: ProxyOptions;
}

export interface StartBrowserResult {
  id: string;
  wsEndpoint: string;
  targetId: string;
}

export class LocalStorageRequiresUrlError extends Error {}

export async function startBrowser(
  options: StartBrowserOptions,
): Promise<StartBrowserResult> {
  const {
    headless = true,
    viewport,
    url,
    initialCookie,
    localstorage,
    userAgent,
    proxy,
  } = options;

  if (localstorage && !url) {
    throw new LocalStorageRequiresUrlError(
      "localstorage requires url to set an origin",
    );
  }

  const browser = await puppeteer.launch({
    headless,
    defaultViewport: viewport ?? null,
    args: proxy ? [`--proxy-server=${proxy.server}`] : [],
  });

  const page = (await browser.pages())[0];
  if (!page) {
    throw new Error("expected an initial page after launch");
  }

  if (proxy?.username || proxy?.password) {
    await page.authenticate({
      username: proxy.username ?? "",
      password: proxy.password ?? "",
    });
  }
  if (userAgent) await page.setUserAgent({ userAgent });
  if (initialCookie?.length) await browser.setCookie(...initialCookie);
  if (url) await page.goto(url);
  if (localstorage) {
    await page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        window.localStorage.setItem(key, value);
      }
    }, localstorage);
  }

  const cdpSession = await page.createCDPSession();
  const { targetInfo } = await cdpSession.send("Target.getTargetInfo");
  await cdpSession.detach();

  const id = randomUUID();
  browsers.set(id, browser);
  return {
    id,
    wsEndpoint: browser.wsEndpoint(),
    targetId: targetInfo.targetId,
  };
}
