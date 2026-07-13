import { timingSafeEqual } from "node:crypto";

const HEADER = "x-callback-token";

/**
 * Whether a request to an `/internal/*` callback carries the shared callback
 * token. The browser server presents `x-callback-token`; anything else is
 * rejected (the caller answers 404). When `BACKEND_CALLBACK_TOKEN` is unset the
 * check is disabled (dev only), mirroring the browser server's bypass token.
 */
export function isValidCallback(headers: Headers): boolean {
  const expected = process.env.BACKEND_CALLBACK_TOKEN;
  if (!expected) return true;

  const provided = headers.get(HEADER);
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
