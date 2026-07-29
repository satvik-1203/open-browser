import { logger } from "@repo/logger";
import type { Browser, CDPSession } from "puppeteer";
import { Connection } from "puppeteer";

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
 * A throwaway document on some origin, addressable only by evaluating in it.
 *
 * Deliberately not a puppeteer `Page`: constructing one is the single most
 * expensive step in a context restore. Puppeteer's `newPage` waits on the full
 * page bring-up, and the stealth plugin injects its ~17 evasions into every new
 * tab as it's created — real work, all of it pointless here, because this
 * document never loads a real site, never runs page scripts and is closed
 * milliseconds later. A raw CDP target skips the lot.
 */
export interface OriginSession {
  /** Evaluate an expression in the document and return its JSON value. */
  evaluate<T>(expression: string): Promise<T>;
}

/**
 * A browser-level CDP session, shared across every origin in one restore or
 * capture. Attaching costs a round trip, and the per-origin work is the same
 * session either way — so opening one per origin was paying that N times.
 */
export interface OriginContext {
  session: CDPSession;
  connection: Connection;
}

export async function openOriginContext(
  browser: Browser,
): Promise<OriginContext> {
  const session = await browser.target().createCDPSession();
  const connection = Connection.fromSession(session);
  if (!connection) {
    throw new Error("no CDP connection behind the browser session");
  }
  return { session, connection };
}

export async function closeOriginContext(ctx: OriginContext): Promise<void> {
  await ctx.session.detach().catch(() => {});
}

function timeout(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
  );
}

/**
 * Run `fn` against a document on `origin`.
 *
 * localStorage is origin-scoped and, unlike cookies, has no browser-level CDP
 * setter — the only way to read or write an origin's store is from a document
 * on that origin. So we open a throwaway target, navigate it to the origin, and
 * evaluate there.
 *
 * The navigation is intercepted and answered locally with an empty document, so
 * this never actually hits the network: no request to the real site (which
 * would be a visible, unexplained hit from an automation IP), no page scripts
 * running, no time spent loading. That matters most on the restore path, where
 * the site would otherwise load *before* its storage was seeded and could
 * decide it was logged out.
 */
export async function withOriginSession<T>(
  ctx: OriginContext,
  origin: string,
  fn: (session: OriginSession) => Promise<T>,
): Promise<T> {
  const { targetId } = await ctx.session.send("Target.createTarget", {
    url: "about:blank",
  });

  let attached: CDPSession | undefined;
  try {
    const { sessionId } = await ctx.session.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const session = ctx.connection.session(sessionId);
    if (!session) throw new Error("attach returned no session");
    attached = session;

    // Answer the top-level document ourselves; refuse anything else the blank
    // page somehow still asks for. Errors are swallowed because a request can
    // already be gone by the time the handler runs (navigation raced it).
    session.on("Fetch.requestPaused", (event) => {
      const isDocument = event.resourceType === "Document";
      void (isDocument
        ? session.send("Fetch.fulfillRequest", {
            requestId: event.requestId,
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "text/html" }],
            body: "",
          })
        : session.send("Fetch.failRequest", {
            requestId: event.requestId,
            errorReason: "Aborted",
          })
      ).catch(() => {});
    });

    await session.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await session.send("Page.enable");

    const loaded = new Promise<void>((resolve) => {
      session.once("Page.loadEventFired", () => resolve());
    });
    await session.send("Page.navigate", { url: origin });
    await Promise.race([loaded, timeout(ORIGIN_PAGE_TIMEOUT_MS, origin)]);

    const evaluate = async <T2>(expression: string): Promise<T2> => {
      // The origin check rides along with the caller's expression rather than
      // costing its own round trip. It has to happen at all: a navigation that
      // silently didn't commit would leave us evaluating against `about:blank`,
      // where reads come back empty and writes go nowhere — a restore that
      // reports success and hands back a logged-out profile.
      const guarded = `(() => {
        if (location.origin !== ${JSON.stringify(origin)}) {
          throw new Error("wrong origin: " + location.origin);
        }
        return (${expression});
      })()`;
      const { result, exceptionDetails } = await session.send(
        "Runtime.evaluate",
        { expression: guarded, returnByValue: true, awaitPromise: true },
      );
      if (exceptionDetails) {
        throw new Error(exceptionDetails.text || "evaluate threw");
      }
      return result.value as T2;
    };

    return await fn({ evaluate });
  } finally {
    await ctx.session
      .send("Target.closeTarget", { targetId })
      .catch((error: unknown) => {
        logger.debug("origin target close failed", {
          origin,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    void attached;
  }
}

/**
 * Convenience for a single origin: opens and closes its own browser session.
 * Callers doing several origins should share one `OriginContext` instead.
 */
export async function withOriginPage<T>(
  browser: Browser,
  origin: string,
  fn: (session: OriginSession) => Promise<T>,
): Promise<T> {
  const ctx = await openOriginContext(browser);
  try {
    return await withOriginSession(ctx, origin, fn);
  } finally {
    await closeOriginContext(ctx);
  }
}
