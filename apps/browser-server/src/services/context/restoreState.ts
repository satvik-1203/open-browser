import { logger } from "@repo/logger";
import type { CookieData, StorageState } from "@repo/types";
import type { Browser } from "puppeteer";

import {
  closeOriginContext,
  isStorableOrigin,
  openOriginContext,
  withOriginSession,
} from "@/services/context/originPage";

/**
 * Origin restores in flight at once. Each holds an open tab, so this trades a
 * brief spike in tabs for a much shorter start.
 */
const RESTORE_CONCURRENCY = 6;

/**
 * Attach an https request-URI to a cookie before setting it.
 *
 * Without it, CDP creates the cookie with an *unset* source scheme, and Chrome
 * then silently drops every `Secure` cookie and every `__Secure-`/`__Host-`
 * prefixed one. The call still reports success — the cookies simply aren't
 * there afterwards. That is precisely the set that carries a real login
 * (Google's `__Secure-1PSID`, `SID`, `SAPISID`), so a restore looked like it
 * worked while landing a logged-out profile.
 *
 * `domain` is kept alongside, so the cookie's own domain attribute (and its
 * host-only vs. leading-dot distinction) still comes from the snapshot.
 */
function withSourceUrl(cookie: CookieData): CookieData & { url: string } {
  const host = cookie.domain.replace(/^\./, "");
  return { ...cookie, url: `https://${host}${cookie.path ?? "/"}` };
}

/**
 * Expression that writes one origin's localStorage, evaluated in the document.
 *
 * Built as source rather than passed as a function + argument because the
 * throwaway document is driven over raw CDP (`Runtime.evaluate`), which takes
 * an expression. The entries are embedded as JSON, so values needing escaping
 * are handled by `JSON.stringify` rather than by hand.
 */
function writeLocalStorageExpression(
  entries: Array<{ name: string; value: string }>,
): string {
  return `(() => {
    for (const { name, value } of ${JSON.stringify(entries)}) {
      try {
        window.localStorage.setItem(name, value);
      } catch {
        // Quota or a disabled store — skip the key, keep the rest.
      }
    }
    return window.localStorage.length;
  })()`;
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
    await browser.setCookie(...state.cookies.map(withSourceUrl));
  }

  // Restore origins concurrently. Each one costs a tab open + navigate, and
  // doing them in series put that cost squarely on the critical path of every
  // start — a real profile spans a handful of origins (a Google login alone
  // touches six), which is seconds of dead time before the caller gets a
  // browser. They're independent, so the whole set costs about as much as the
  // slowest one. Bounded so a large profile can't open tabs without limit.
  const targets = (state.origins ?? []).filter(
    ({ origin, localStorage }) => isStorableOrigin(origin) && localStorage?.length,
  );

  const restored: string[] = [];
  const queue = targets.slice();
  if (queue.length) {
    // One browser-level CDP session for the whole restore, not one per origin.
    const ctx = await openOriginContext(browser);
    try {
      await Promise.all(
        Array.from(
          { length: Math.min(RESTORE_CONCURRENCY, queue.length) },
          async () => {
            while (queue.length) {
              const target = queue.shift();
              if (!target) return;
              try {
                await withOriginSession(ctx, target.origin, (session) =>
                  session.evaluate(
                    writeLocalStorageExpression(target.localStorage),
                  ),
                );
                restored.push(target.origin);
              } catch (error) {
                // Best-effort per origin. Cookies alone carry most real logins
                // (Google's included), so a failed origin degrades the session
                // rather than failing the start.
                logger.warn("context restore skipped an origin", {
                  origin: target.origin,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          },
        ),
      );
    } finally {
      await closeOriginContext(ctx);
    }
  }

  logger.info("context state restored", {
    cookies: state.cookies?.length ?? 0,
    origins: restored.length,
  });
  return restored;
}
