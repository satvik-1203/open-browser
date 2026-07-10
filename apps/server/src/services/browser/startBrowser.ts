import { randomUUID } from "node:crypto";
import type { StartBrowserOptions } from "@repo/types";
import puppeteer from "puppeteer";
import { sessions } from "@/lib/browsers";
import type { BrowserSession } from "@/lib/browsers.types";
import {
  LocalStorageRequiresUrlError,
  RecordingNotConfiguredError,
} from "@/services/browser/errors";
import { finalizeRecording } from "@/services/browser/finalizeRecording";
import type { StartBrowserResult } from "@/services/browser/types";
import { startRecording } from "@/services/recording/index";
import { isStorageConfigured } from "@/services/storage/index";

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

  const id = randomUUID();
  const session: BrowserSession = {
    id,
    browser,
    targetId: targetInfo.targetId,
    createdAt: Date.now(),
  };

  if (record) {
    session.recorder = await startRecording(page);
    session.recording = { status: "recording" };
    // Best-effort upload if the browser dies unexpectedly. No-op on the normal
    // stop path, where the recorder has already been finalized before close().
    browser.once("disconnected", () => {
      void finalizeRecording(session);
    });
  }

  sessions.set(id, session);
  return {
    id,
    wsEndpoint: browser.wsEndpoint(),
    targetId: targetInfo.targetId,
  };
}
