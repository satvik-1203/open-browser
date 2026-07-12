import { randomUUID } from "node:crypto";
import type { StartBrowserOptions } from "@repo/types";
import puppeteer from "puppeteer";
import { sessions } from "@/lib/browsers";
import type { BrowserSession } from "@/lib/browsers.types";
import {
  LocalStorageRequiresUrlError,
  RecordingNotConfiguredError,
} from "@/services/browser/errors";
import { handleSessionEnd } from "@/services/browser/handleSessionEnd";
import type { StartBrowserResult } from "@/services/browser/types";
import { startRecording } from "@/services/recording/index";
import { isStorageConfigured } from "@/services/storage/index";

export async function startBrowser(
  options: StartBrowserOptions,
  id: string = randomUUID(),
): Promise<StartBrowserResult> {
  const {
    headless = true,
    viewport,
    url,
    initialCookie,
    localstorage,
    userAgent,
    proxy,
    record,
  } = options;

  if (localstorage && !url) {
    throw new LocalStorageRequiresUrlError(
      "localstorage requires url to set an origin",
    );
  }
  if (record && !isStorageConfigured()) {
    throw new RecordingNotConfiguredError(
      "recording is not configured on this server",
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

  const session: BrowserSession = {
    id,
    browser,
    targetId: targetInfo.targetId,
    createdAt: Date.now(),
  };

  if (record) {
    session.recorder = await startRecording(page);
    session.recording = { status: "recording" };
  }

  // Settle the session on any disconnect — a crash (reported to the backend as
  // `failed`) or the normal stop path (already handled by stopBrowser, so this
  // no-ops). Also finalizes a pending recording if the browser died unexpectedly.
  browser.once("disconnected", () => {
    void handleSessionEnd(session);
  });

  sessions.set(id, session);
  return {
    id,
    wsEndpoint: browser.wsEndpoint(),
    targetId: targetInfo.targetId,
  };
}
