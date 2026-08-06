import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

import { logger } from "@repo/logger";
import type { StartBrowserPayload } from "@repo/types";

import { sessions } from "@/lib/browsers";
import type { BrowserSession } from "@/lib/browsers.types";
import {
  ContextNotStoredError,
  LocalStorageRequiresUrlError,
  RecordingNotConfiguredError,
} from "@/services/browser/errors";
import { installFingerprint } from "@/services/browser/fingerprint";
import { handleSessionEnd } from "@/services/browser/handleSessionEnd";
import { getLauncher } from "@/services/browser/launchers/index";
import { PhaseTimer, timed } from "@/services/browser/timings";
import type { StartBrowserResult } from "@/services/browser/types";
import { installViewport } from "@/services/browser/viewport";
import { fetchProfileArchive } from "@/services/context/index";
import { startRecording } from "@/services/recording/index";
import { isStorageConfigured } from "@/services/storage/index";

export async function startBrowser(
  options: StartBrowserPayload,
  id: string = randomUUID(),
): Promise<StartBrowserResult> {
  const timer = new PhaseTimer();
  const {
    // Headful by default — less bot-detectable. Every launcher provides a
    // display for it (Xvfb locally in the container, Xvfb in the sandbox
    // image), so this is a real default and not a best-effort one.
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
  const lang = identity?.languages?.[0] ?? identity?.locale ?? "en-US";

  timer.mark("validate");

  // The profile has to be in place before the browser starts, because it *is*
  // the launch: Chromium takes its user data directory as a flag and reads it
  // at startup. Fetched as an archive and handed to the launcher, which decides
  // where it lands.
  const profileArchive = context
    ? await timed(timer, "profileLoad", () =>
        fetchProfileArchive(context.loadKey),
      )
    : undefined;

  const launcher = getLauncher();
  let runtime;
  try {
    runtime = await launcher.launch({
      id,
      headless,
      lang,
      proxy,
      // A context session always runs on its own user data directory, whether
      // or not there was anything to restore into it — otherwise a context that
      // has never been saved could never take its first save.
      useProfile: Boolean(context),
      profileArchive,
    });
  } finally {
    // The launcher has taken whatever it needs from the archive by now — it is
    // either extracted on disk or uploaded into the sandbox — so the local copy
    // is dead weight whether the launch succeeded or threw.
    if (profileArchive) {
      await fs.rm(profileArchive, { force: true }).catch(() => {});
    }
  }

  timer.mark("launch");

  const { browser } = runtime;
  try {
    const page =
      (await browser.pages())[0] ??
      // A freshly connected remote browser can report its initial target a beat
      // after the CDP endpoint answers, so make one rather than fail the start.
      (await browser.newPage());

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
      runtime,
      browser,
      targetId: targetInfo.targetId,
      createdAt: Date.now(),
    };

    if (context) {
      session.context = {
        id: context.id,
        persist: context.persist === true,
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
    logger.info("browser start timings", {
      id,
      launcher: launcher.name,
      ...timer.report(),
    });
    return {
      id,
      wsEndpoint: runtime.wsEndpoint(),
      targetId: targetInfo.targetId,
    };
  } catch (error) {
    // No session owns the runtime yet, so nothing else would ever tear it down —
    // and for a remote launcher that means a sandbox billing until its auto-stop.
    await runtime.dispose();
    throw error;
  }
}
