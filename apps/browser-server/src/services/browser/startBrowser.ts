import { randomUUID } from "node:crypto";
import { logger } from "@repo/logger";
import type { StartBrowserPayload, StorageState } from "@repo/types";
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
  captureCookies,
  loadSnapshot,
  restoreState,
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

  // Fetch the snapshot alongside the launch rather than after it. Both are
  // hundreds of milliseconds and neither needs the other's result, so running
  // them in series put the whole storage round trip on the critical path for
  // no reason. Kicked off first so it has the launch's duration to work with.
  const snapshotPromise = context?.loadKey
    ? timed(timer, "snapshotLoad", () => loadSnapshot(context.loadKey as string))
    : undefined;
  // Never leave it unhandled: if the launch throws, nothing awaits this and an
  // S3 failure would otherwise take the process down as an unhandled rejection.
  snapshotPromise?.catch(() => {});

  const warmBrowser = await takeWarmBrowser({
    headless,
    lang,
    proxyServer: proxy?.server,
  });

  const browser =
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
        ...sandboxArgs,
        ...(proxy ? [`--proxy-server=${proxy.server}`] : []),
      ],
    }));

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

  const contextOrigins = new Set<string>();
  // The merge base: what this session started from. Teardown diffs against it
  // to isolate this session's own changes. An empty base is correct for a
  // context with no snapshot yet — everything the session does is new.
  let contextBase: StorageState = { cookies: [], origins: [] };
  if (snapshotPromise) {
    const snapshot = await snapshotPromise;
    if (snapshot) {
      const restoredOrigins = await timed(timer, "restore", () =>
        restoreState(browser, snapshot),
      );
      for (const origin of restoredOrigins) contextOrigins.add(origin);

      // Re-read the cookies the browser actually ended up with, rather than
      // trusting the snapshot we handed it. Chrome silently drops cookies it
      // won't accept, and a base claiming cookies that were never really there
      // makes teardown compute them as *deletions* — a failed restore would
      // then erase the very login it was supposed to reuse. One CDP call.
      contextBase = {
        cookies: await timed(timer, "rereadCookies", () =>
          captureCookies(browser),
        ),
        origins: snapshot.origins.filter((o) => restoredOrigins.includes(o.origin)),
      };
      const dropped = snapshot.cookies.length - contextBase.cookies.length;
      if (dropped > 0) {
        logger.warn("browser rejected some restored cookies", {
          id,
          contextId: context?.id,
          expected: snapshot.cookies.length,
          actual: contextBase.cookies.length,
        });
      }
    } else {
      // The row pointed at a key that isn't there. Start clean rather than
      // fail — the caller gets a usable browser and the next save repairs it.
      logger.warn("context snapshot missing; starting clean", {
        id,
        contextId: context?.id,
        key: context?.loadKey,
      });
    }
  }
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

  if (context) {
    session.context = {
      id: context.id,
      persist: context.persist === true,
      base: contextBase,
      origins: contextOrigins,
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
