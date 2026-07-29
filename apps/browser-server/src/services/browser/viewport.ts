import { logger } from "@repo/logger";
import type { Browser, Viewport } from "puppeteer";

/**
 * Apply a viewport to every page in the session, now and for its lifetime.
 *
 * This is what puppeteer's `defaultViewport` launch option does, done by hand.
 * Doing it by hand is the point: `defaultViewport` is not a Chrome flag — it's
 * applied per page by puppeteer — but passing it *at launch* would force every
 * request with a custom viewport to launch its own browser, when a pre-launched
 * one would have served it perfectly well. Setting it here instead means a
 * viewport costs a CDP call rather than a Chrome start.
 *
 * The `targetcreated` half matters as much as the initial page: `defaultViewport`
 * applies to tabs opened later too, so without it a popup or a second tab would
 * silently come up at the window's size instead of the one the caller asked for.
 */
export async function installViewport(
  browser: Browser,
  viewport: Viewport,
): Promise<void> {
  browser.on("targetcreated", (target) => {
    void (async () => {
      try {
        const page = await target.page();
        if (page) await page.setViewport(viewport);
      } catch (error) {
        logger.debug("viewport not applied to new target", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });

  for (const page of await browser.pages()) {
    await page.setViewport(viewport);
  }
}
