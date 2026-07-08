import { randomUUID } from "node:crypto";
import type { StartBrowserOptions } from "@repo/types";
import puppeteer from "puppeteer";
import { browsers } from "@/lib/browsers.js";

export type { StartBrowserOptions };

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

  const sandboxArgs =
    process.env.PUPPETEER_NO_SANDBOX === "true"
      ? ["--no-sandbox", "--disable-setuid-sandbox"]
      : [];

  const browser = await puppeteer.launch({
    headless,
    defaultViewport: viewport ?? null,
    args: [
      "--disable-dev-shm-usage",
      ...sandboxArgs,
      ...(proxy ? [`--proxy-server=${proxy.server}`] : []),
    ],
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
