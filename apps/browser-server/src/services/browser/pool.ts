import { logger } from "@repo/logger";
import type { Browser, LaunchOptions } from "puppeteer";
import puppeteer from "puppeteer-extra";

/**
 * Pre-launched browsers waiting to be handed to a start request.
 *
 * Launching Chrome is by far the largest fixed cost in a start — around half a
 * second on a warm host, more in a container — and none of it depends on
 * anything the caller sent. So we pay it before the request arrives instead of
 * during it: a start that finds a warm browser skips the launch entirely.
 *
 * A pooled browser is only ever handed out if it is *pristine* — freshly
 * launched, never navigated, never given cookies. That is what makes reuse safe
 * here and not merely fast: there is no state to leak between sessions, because
 * nothing has happened in it yet. A browser is never returned to the pool after
 * a session; it is closed, and a replacement is launched clean.
 */

/** Warm browsers kept ready. 0 disables pooling entirely. */
const POOL_SIZE = Number(process.env.BROWSER_POOL_SIZE ?? 2);

/**
 * Recycle a warm browser that has waited this long. An idle Chrome slowly
 * accumulates memory and can be reaped by the OS out from under us, so a
 * browser that has sat unused all night is not the one we want to hand to the
 * first request of the morning.
 */
const MAX_IDLE_MS = Number(process.env.BROWSER_POOL_MAX_IDLE_MS ?? 30 * 60_000);

interface WarmBrowser {
  browser: Browser;
  launchedAt: number;
}

/**
 * The launch config the pool warms for.
 *
 * Only *this* shape can be served from the pool: launch flags bake into the
 * process (a proxy, the UI language, headless mode), so a browser launched for
 * one config cannot be handed to a request that asked for another. The default
 * shape is the overwhelming majority of traffic; anything else launches on
 * demand, exactly as before.
 */
export interface LaunchKey {
  headless: boolean;
  lang: string;
  proxyServer?: string;
}

/**
 * Built field by field rather than by serializing the object, so the identity
 * of a config can't change with property order or with a field being present-
 * but-undefined — either of which would silently turn every request into a miss.
 */
export function launchKeyOf(key: LaunchKey): string {
  return [
    key.headless ? "headless" : "headful",
    key.lang,
    key.proxyServer ?? "",
  ].join("|");
}

/** The one config we keep warm. Must agree with `startBrowser`'s defaults. */
export const DEFAULT_LAUNCH_KEY: LaunchKey = {
  headless: false,
  lang: "en-US",
};

/**
 * How long an exhausted take will wait for a refill already in flight before
 * giving up and launching its own. Bounded by roughly what a launch costs: past
 * that, waiting is strictly worse than doing the work.
 */
const WAIT_FOR_REFILL_MS = Number(process.env.BROWSER_POOL_WAIT_MS ?? 1_500);

const warm: WarmBrowser[] = [];
/** In-flight refills, so concurrent takes don't over-launch. */
let pending = 0;
let shuttingDown = false;
/** Takes parked on an in-flight refill, oldest first. */
const waiters: Array<(browser: Browser | undefined) => void> = [];

function isPoolable(key: LaunchKey): boolean {
  return launchKeyOf(key) === launchKeyOf(DEFAULT_LAUNCH_KEY);
}

/**
 * Launch options for the pooled config. Kept here rather than passed in so a
 * warm browser can never be launched with different flags than the request that
 * later claims it — the two would drift apart silently.
 */
export function defaultLaunchOptions(): LaunchOptions {
  const sandboxArgs =
    process.env.PUPPETEER_NO_SANDBOX === "true"
      ? ["--no-sandbox", "--disable-setuid-sandbox"]
      : [];

  return {
    headless: DEFAULT_LAUNCH_KEY.headless,
    defaultViewport: null,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      `--lang=${DEFAULT_LAUNCH_KEY.lang}`,
      ...sandboxArgs,
    ],
  };
}

async function launchWarm(): Promise<void> {
  pending++;
  try {
    const started = performance.now();
    const browser = await puppeteer.launch(defaultLaunchOptions());
    if (shuttingDown) {
      await browser.close().catch(() => {});
      return;
    }
    // A warm browser can die while it waits (OOM killer, a crash, the user
    // closing the window on a desktop host). Drop it so it is never handed out
    // as if it were live — the take path would otherwise return a corpse.
    browser.once("disconnected", () => {
      const index = warm.findIndex((entry) => entry.browser === browser);
      if (index >= 0) {
        warm.splice(index, 1);
        logger.warn("warm browser disconnected while idle");
        void refill();
      }
    });
    // Hand it straight to whoever is already waiting rather than parking it.
    const waiter = waiters.shift();
    if (waiter) {
      waiter(browser);
      logger.info("warm browser handed to waiting start", {
        ms: Math.round(performance.now() - started),
      });
      return;
    }

    warm.push({ browser, launchedAt: Date.now() });
    logger.info("warm browser ready", {
      ms: Math.round(performance.now() - started),
      warm: warm.length,
    });
  } catch (error) {
    // Pooling is an optimization; a failure to pre-launch must not break starts.
    // They fall back to launching inline, which is the pre-pool behaviour.
    logger.warn("warm browser launch failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Release a parked start rather than making it sit out the full timeout for
    // a browser that is never coming.
    waiters.shift()?.(undefined);
  } finally {
    pending--;
  }
}

/** Top the pool back up to size, in the background. */
export function refill(): void {
  if (shuttingDown || POOL_SIZE <= 0) return;
  while (warm.length + pending < POOL_SIZE) void launchWarm();
}

/**
 * Take a warm browser for this launch config, or undefined if the caller needs
 * flags we don't keep warm (a proxy, headless, a custom viewport or language).
 *
 * Always schedules a refill, so the pool recovers whether or not it had a hit.
 */
export async function takeWarmBrowser(
  key: LaunchKey,
): Promise<Browser | undefined> {
  if (POOL_SIZE <= 0 || !isPoolable(key)) return undefined;

  let taken: Browser | undefined;
  while (warm.length > 0) {
    const entry = warm.shift();
    if (!entry) break;
    if (Date.now() - entry.launchedAt > MAX_IDLE_MS) {
      logger.info("discarding stale warm browser");
      void entry.browser.close().catch(() => {});
      continue;
    }
    if (!entry.browser.connected) continue;
    taken = entry.browser;
    break;
  }

  refill();
  if (taken) return taken;

  // Exhausted, but a replacement is already on its way. Waiting for it beats
  // launching alongside it: a burst that launched one browser per miss would
  // have every one of those launches competing with the refills for the same
  // cores, which is how a miss ends up slower than a cold start ever was.
  if (pending > 0) return waitForRefill();
  return undefined;
}

function waitForRefill(): Promise<Browser | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (browser: Browser | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(browser);
    };
    const timer = setTimeout(() => {
      const index = waiters.indexOf(done);
      if (index >= 0) waiters.splice(index, 1);
      // Fall through to an inline launch. Slower than a hit, but a start that
      // waits indefinitely on a wedged launcher is worse than a slow one.
      done(undefined);
    }, WAIT_FOR_REFILL_MS);
    waiters.push(done);
  });
}

/** Warm browsers currently ready — for metrics and tests. */
export function warmCount(): number {
  return warm.length;
}

/** Close every idle browser. Called on shutdown, alongside live sessions. */
export async function drainPool(): Promise<void> {
  shuttingDown = true;
  while (waiters.length) waiters.shift()?.(undefined);
  const entries = warm.splice(0, warm.length);
  await Promise.all(entries.map((entry) => entry.browser.close().catch(() => {})));
}
