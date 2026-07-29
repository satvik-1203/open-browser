import { logger } from "@repo/logger";
import type { StorageState } from "@repo/types";
import type { Browser } from "puppeteer";

import { isStorableOrigin, withOriginPage } from "@/services/context/originPage";

/** Write one origin's localStorage. Runs in page context. */
function writeLocalStorage(entries: Array<{ name: string; value: string }>) {
  for (const { name, value } of entries) {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Quota or a disabled store — skip the key, keep the rest.
    }
  }
}

/**
 * Hydrate a fresh browser from a snapshot, before any real navigation happens.
 *
 * Returns the origins that were seeded, so the session can hand them back to
 * `captureState` at teardown and round-trip cleanly even if it navigated away.
 *
 * Cookies restore in a single browser-level call. localStorage costs one
 * throwaway tab per origin (see `withOriginPage`), which is why the snapshot
 * only carries origins that actually had data.
 */
export async function restoreState(
  browser: Browser,
  state: StorageState,
): Promise<string[]> {
  if (state.cookies?.length) {
    // One call for the lot: a partial cookie restore is worse than none, since
    // a half-populated Google session reads as a tampered one.
    await browser.setCookie(...state.cookies);
  }

  const restored: string[] = [];
  for (const { origin, localStorage } of state.origins ?? []) {
    if (!isStorableOrigin(origin) || !localStorage?.length) continue;
    try {
      await withOriginPage(browser, origin, (page) =>
        page.evaluate(writeLocalStorage, localStorage),
      );
      restored.push(origin);
    } catch (error) {
      // Best-effort per origin. Cookies alone carry most real logins (Google's
      // included), so a failed origin degrades the session rather than failing
      // the start.
      logger.warn("context restore skipped an origin", {
        origin,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info("context state restored", {
    cookies: state.cookies?.length ?? 0,
    origins: restored.length,
  });
  return restored;
}
