import { randomUUID } from "node:crypto";
import { logger } from "@repo/logger";
import type { StartBrowserPayload } from "@repo/types";
import type { Browser } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { sessions } from "@/lib/browsers";
import type { BrowserSession } from "@/lib/browsers.types";
import {
  ContextNotStoredError,
  LocalStorageRequiresUrlError,
  RecordingNotConfiguredError,
} from "@/services/browser/errors";
import { installFingerprint } from "@/services/browser/fingerprint";
import { handleSessionEnd } from "@/services/browser/handleSessionEnd";
import { takeWarmBrowser, warmCount } from "@/services/browser/pool";
import { PhaseTimer, timed } from "@/services/browser/timings";
import type { StartBrowserResult } from "@/services/browser/types";
import { installViewport } from "@/services/browser/viewport";
import {
  discardProfile,
  materializeProfile,
} from "@/services/context/index";
import { startRecording } from "@/services/recording/index";
import { isStorageConfigured } from "@/services/storage/index";

// puppeteer-extra's stealth plugin bundles ~17 evasions (webdriver, chrome.runtime,
// navigator.plugins/languages, WebGL vendor, iframe.contentWindow, codecs, …) —
// far more thorough than hand-rolled patches. Registered once at module load.
puppeteer.use(StealthPlugin());

export async function startBrowser(
  options: StartBrowserPayload,
  id: string = randomUUID(),
): Promise<StartBrowserResult> {
  const timer = new PhaseTimer();
  const {
    // Headful by default — less bot-detectable, and the container runs under
    // Xvfb so a display is available. Callers can still opt into headless.
    headless = false,
    viewport,
    url,
    initialCookie,
    localstorage,
    userAgent,
    fingerprint,
    proxy,
    context,
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
  if (context && !isStorageConfigured()) {
    throw new ContextNotStoredError(
      "contexts are not configured on this server",
    );
  }

  // The legacy top-level `userAgent` is the same knob as `fingerprint.userAgent`
  // — fold it in so both paths produce one coherent identity rather than a UA
  // that contradicts the client hints.
  const identity = fingerprint ?? (userAgent ? { userAgent } : undefined);

  const sandboxArgs =
    process.env.PUPPETEER_NO_SANDBOX === "true"
      ? ["--no-sandbox", "--disable-setuid-sandbox"]
      : [];

  const lang = identity?.languages?.[0] ?? identity?.locale ?? "en-US";

  timer.mark("validate");

  // The profile has to exist on disk before the launch, because it *is* the
  // launch: Chromium takes its user data directory as a flag and reads it at
  // startup. That also rules out the warm pool for context sessions — a pooled
  // browser is already running against its own throwaway profile, and a profile
  // cannot be swapped into a live browser.
  const profileDir = context
    ? await timed(timer, "profileLoad", () => materializeProfile(context.loadKey))
    : undefined;

  const warmBrowser = profileDir
    ? undefined
    : await takeWarmBrowser({
        headless,
        lang,
        proxyServer: proxy?.server,
      });

  let browser: Browser;
  try {
    browser =
      warmBrowser ??
      (await puppeteer.launch({
        headless,
        // Applied per-page by `installViewport` below instead, so that a custom
        // viewport doesn't disqualify a request from using a warm browser.
        defaultViewport: null,
        // Drop the automation flag puppeteer adds by default; combined with the
        // blink-feature switch below this removes the most obvious `webdriver` tells.
        ignoreDefaultArgs: ["--enable-automation"],
        args: [
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
          // Chrome bakes its UI language into some surfaces before any CDP override
          // can run, so the launch flag has to agree with the emulated locale.
          `--lang=${lang}`,
          // Passed as an argument rather than puppeteer's `userDataDir` option
          // on purpose. With the option, a profile directory is destroyed on
          // `browser.close()` whenever a pool browser launches alongside this
          // one — puppeteer's own temp-profile cleanup, which only ever applies
          // to directories it created, ends up pointed at ours. Reproduced
          // directly: option + concurrent pool launch leaves 4 of 40 entries,
          // the same arg passed here leaves all 38. Chromium reads the flag
          // identically either way.
          ...(profileDir ? [`--user-data-dir=${profileDir}`] : []),
          ...sandboxArgs,
          ...(proxy ? [`--proxy-server=${proxy.server}`] : []),
        ],
      }));
  } catch (error) {
    // Nothing owns the directory yet — no session exists to clean it up — so a
    // failed launch would otherwise leak a whole profile into the temp dir.
    if (profileDir) await discardProfile(profileDir);
    throw error;
  }

  timer.mark("launch");
  timer.set("warm", warmBrowser ? 1 : 0);

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
  // Before anything navigates: the identity has to be in place for the very
  // first request, and a context has to be hydrated before the site it belongs
  // to gets a chance to decide the browser is logged out.
  await installFingerprint(browser, identity);
  if (viewport) await installViewport(browser, viewport);
  timer.mark("fingerprint");

  // Nothing to hydrate: the context was already in place before Chromium
  // started, which is the point — the site never gets a window in which it can
  // decide the browser is logged out.
  timer.mark("context");

  // After the context, so an explicitly-passed cookie overrides the stored one.
  if (initialCookie?.length) await browser.setCookie(...initialCookie);
  if (url) await page.goto(url);
  if (localstorage) {
    await page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        window.localStorage.setItem(key, value);
      }
    }, localstorage);
  }

  timer.mark("navigate");

  const cdpSession = await page.createCDPSession();
  const { targetInfo } = await cdpSession.send("Target.getTargetInfo");
  await cdpSession.detach();
  timer.mark("targetInfo");

  const session: BrowserSession = {
    id,
    browser,
    targetId: targetInfo.targetId,
    createdAt: Date.now(),
  };

  if (context && profileDir) {
    session.context = {
      id: context.id,
      persist: context.persist === true,
      dir: profileDir,
    };
  }

  if (record) {
    session.recorder = await startRecording(page);
    session.recording = { status: "recording" };
    timer.mark("recording");
  }

  // Settle the session on any disconnect — a crash (reported to the backend as
  // `failed`) or the normal stop path (already handled by stopBrowser, so this
  // no-ops). Also finalizes a pending recording if the browser died unexpectedly.
  browser.once("disconnected", () => {
    // `endHandled` is set synchronously by stopBrowser on the normal stop path,
    // so its value here distinguishes an expected teardown from an unexpected
    // crash — the latter is what silently orphans a session as "running".
    const expected = session.endHandled === true;
    logger[expected ? "info" : "warn"]("browser disconnected", { id, expected });
    void handleSessionEnd(session);
  });

  sessions.set(id, session);
  // Phase breakdown plus how deep the pool was left. Together they say not just
  // that a start was slow but why: a miss with an empty pool is a capacity
  // problem, a hit that's still slow is a context problem.
  logger.info("browser start timings", {
    id,
    ...timer.report(),
    poolDepth: warmCount(),
  });
  return {
    id,
    wsEndpoint: browser.wsEndpoint(),
    targetId: targetInfo.targetId,
  };
}
