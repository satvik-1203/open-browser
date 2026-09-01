import { logger } from "@repo/logger";

import { sessions } from "@/lib/browsers";
import type { BrowserSession } from "@/lib/browsers.types";
import { stopBrowser } from "@/services/browser/stopBrowser";

/**
 * The automatic stop a session can be started with, and the keepalive that
 * pushes it back.
 *
 * A session with a deadline stops itself when the deadline passes. A caller
 * that heartbeats turns that into an idle timeout, because every keepalive
 * moves the deadline to `now + timeoutMs`. A caller that does not gets a plain
 * TTL. Both shapes come from the one `timeoutMs` the session was started with,
 * which is why there is no separate idle option to keep in step with it.
 *
 * Extension is explicit on purpose. Making ordinary traffic count as activity
 * reads as friendlier and is worse: an embedder polling `GET /browser/:id`
 * every few seconds would hold a browser open forever without ever meaning to,
 * and the timeout would quietly stop protecting anyone.
 */

/**
 * The shortest deadline worth honouring. A browser takes a second or two to
 * launch, so anything under this could stop a session before its owner ever saw
 * it. Low enough to stay usable for a genuinely short-lived scrape, and low
 * enough that a test can watch a session expire without sleeping for a minute.
 */
const MIN_TIMEOUT_MS = 5_000;

/**
 * The longest deadline accepted. Past this a timeout is not doing the job it
 * exists for, and a caller that genuinely wants a browser open for a day should
 * say so by omitting `timeoutMs` rather than by naming a number that looks like
 * a safety net and is not one.
 */
const MAX_TIMEOUT_MS = 6 * 60 * 60_000;

/**
 * Reject a timeout this server will not honour, and return the value it will.
 *
 * Returns the problem rather than throwing it: this runs inside `startBrowser`,
 * where the only other outcome is a launched browser, and a caller who
 * mistyped a millisecond value deserves a 400 rather than a browser that dies
 * in 300ms.
 */
export function validateTimeout(
  timeoutMs: number | undefined,
): { ok: true; timeoutMs: number | undefined } | { ok: false; detail: string } {
  if (timeoutMs === undefined) return { ok: true, timeoutMs: undefined };
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { ok: false, detail: "timeoutMs must be a positive number" };
  }
  if (timeoutMs < MIN_TIMEOUT_MS) {
    return { ok: false, detail: `timeoutMs must be at least ${MIN_TIMEOUT_MS}` };
  }
  if (timeoutMs > MAX_TIMEOUT_MS) {
    return { ok: false, detail: `timeoutMs must be at most ${MAX_TIMEOUT_MS}` };
  }
  return { ok: true, timeoutMs };
}

/**
 * Start or restart the countdown on a session.
 *
 * Idempotent, and safe to call on a session that is already counting down: the
 * previous timer is cleared first, so a keepalive replaces the deadline rather
 * than stacking a second stop behind it. A session started without `timeoutMs`
 * has nothing to arm and is left alone.
 *
 * The timer is unrefed so a browser sitting on a long deadline never holds the
 * process open by itself. Shutdown ends every session through its own path, and
 * a timer that could delay that would only make a deploy slower.
 */
export function armDeadline(session: BrowserSession): number | undefined {
  if (session.timeoutMs === undefined) return undefined;

  if (session.expiryTimer) clearTimeout(session.expiryTimer);

  const { id, timeoutMs } = session;
  session.expiresAt = Date.now() + timeoutMs;
  session.expiryTimer = setTimeout(() => {
    // Read from the map rather than closing over the session, so a timer that
    // somehow outlives its teardown finds nothing and stops instead of ending a
    // session twice. `handleSessionEnd` is idempotent as well, so this is belt
    // and braces on the path that costs money to get wrong.
    if (!sessions.has(id)) return;
    logger.info("browser session timed out", { id, timeoutMs });
    stopBrowser(id);
  }, timeoutMs);
  session.expiryTimer.unref();

  return session.expiresAt;
}

/**
 * Push a live session's deadline out by its full timeout, and report the new
 * one.
 *
 * Undefined means there is nothing to extend, either because no session has
 * this id or because it was started without a timeout. Both are the caller's
 * problem to tell apart, and the route above does.
 */
export function extendDeadline(id: string): number | undefined {
  const session = sessions.get(id);
  if (!session || session.timeoutMs === undefined) return undefined;
  return armDeadline(session);
}
