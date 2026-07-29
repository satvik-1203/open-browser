import { logger } from "@repo/logger";
import type { Browser, Page } from "puppeteer";

/** Cap on how long a single origin's blank-page round trip may take. */
const ORIGIN_PAGE_TIMEOUT_MS = 10_000;

/** Only http(s) origins can hold localStorage worth persisting. */
export function isStorableOrigin(origin: string): boolean {
  return origin.startsWith("http://") || origin.startsWith("https://");
}

/** The origin of a URL, or undefined when it has none we can use. */
export function originOf(url: string): string | undefined {
  try {
    const { origin } = new URL(url);
    return isStorableOrigin(origin) ? origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Run `fn` in a document on `origin`.
 *
 * localStorage is origin-scoped and, unlike cookies, has no browser-level CDP
 * setter — the only way to read or write an origin's store is from a document
 * on that origin. So we open a throwaway tab, navigate it to the origin, and
 * evaluate there.
 *
 * The navigation is intercepted and answered locally with an empty document, so
 * this never actually hits the network: no request to the real site (which
 * would be a visible, unexplained hit from an automation IP), no page scripts
 * running, no time spent loading. That matters most on the restore path, where
 * the site would otherwise load *before* its storage was seeded and could
 * decide it was logged out.
 */
export async function withOriginPage<T>(
  browser: Browser,
  origin: string,
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      // Answer the top-level document ourselves; abort anything the blank page
      // somehow still asks for. `catch` because a request can already be gone
      // by the time we get here (navigation raced the handler).
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        void request
          .respond({ status: 200, contentType: "text/html", body: "" })
          .catch(() => {});
      } else {
        void request.abort().catch(() => {});
      }
    });

    await page.goto(origin, {
      waitUntil: "domcontentloaded",
      timeout: ORIGIN_PAGE_TIMEOUT_MS,
    });
    return await fn(page);
  } finally {
    await page.close().catch((error: unknown) => {
      logger.debug("origin page close failed", {
        origin,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
