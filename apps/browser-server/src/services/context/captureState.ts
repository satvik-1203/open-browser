import { logger } from "@repo/logger";
import type { CookieData, OriginStorage, StorageState } from "@repo/types";
import type { Browser, Page } from "puppeteer";

import { originOf, withOriginPage } from "@/services/context/originPage";

/**
 * Bound on how many origins we'll walk when saving. Each one that isn't already
 * open costs a tab open + navigate, so an unbounded set would let a session that
 * touched hundreds of origins stall teardown.
 */
const MAX_ORIGINS = 50;

/** Read one document's localStorage. Runs in page context. */
function readLocalStorage(): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const name = window.localStorage.key(i);
    if (name === null) continue;
    const value = window.localStorage.getItem(name);
    if (value !== null) out.push({ name, value });
  }
  return out;
}

/** Origins with a live document right now, across every open tab and frame. */
async function openOrigins(browser: Browser): Promise<Map<string, Page>> {
  const found = new Map<string, Page>();
  for (const page of await browser.pages()) {
    for (const frame of page.frames()) {
      const origin = originOf(frame.url());
      // First page wins — any document on the origin reads the same store.
      if (origin && !found.has(origin)) found.set(origin, page);
    }
  }
  return found;
}

/**
 * Snapshot the browser's cookies + localStorage in Playwright `storageState`
 * shape.
 *
 * Cookies come from the browser-level CDP call, so httpOnly and `Secure`
 * cookies are included — which is the whole ballgame, since that's where every
 * real session token lives (Google's `__Secure-1PSID`, and so on).
 *
 * localStorage is gathered from origins with a live document, plus `extra` —
 * the origins this session restored at start. Without that second set, a
 * session that loaded a context and then navigated away would save back a
 * snapshot missing the very origins it was created to remember.
 *
 * Safe to call on a running browser; nothing here closes or disturbs it.
 */
export async function captureState(
  browser: Browser,
  extra: Iterable<string> = [],
): Promise<StorageState> {
  const cookies: CookieData[] = (await browser.cookies()).map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    // CDP reports unset SameSite as "Default", which is not a value you can set
    // it back to — pass it through and the restore call is rejected. Dropping
    // the field reproduces the same unset state.
    ...(cookie.sameSite && cookie.sameSite !== "Default"
      ? { sameSite: cookie.sameSite }
      : {}),
    // Session cookies carry expires -1; drop it so they restore as session
    // cookies rather than as cookies that expired in 1969.
    ...(cookie.expires > 0 ? { expires: cookie.expires } : {}),
  }));

  const live = await openOrigins(browser);
  const targets = new Set<string>(live.keys());
  for (const origin of extra) targets.add(origin);

  const origins: OriginStorage[] = [];
  let visited = 0;
  for (const origin of targets) {
    if (visited >= MAX_ORIGINS) {
      logger.warn("context capture hit origin cap; remaining origins skipped", {
        cap: MAX_ORIGINS,
        skipped: targets.size - visited,
      });
      break;
    }
    visited++;
    try {
      const page = live.get(origin);
      const localStorage = page
        ? await page.evaluate(readLocalStorage)
        : await withOriginPage(browser, origin, (p) => p.evaluate(readLocalStorage));
      if (localStorage.length) origins.push({ origin, localStorage });
    } catch (error) {
      // One unreadable origin must never sink the snapshot — the cookies are
      // the valuable part and they're already in hand.
      logger.warn("context capture skipped an origin", {
        origin,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { cookies, origins };
}
