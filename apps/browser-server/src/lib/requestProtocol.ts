import type { Request } from "express";

/**
 * Whether the original client request reached us over TLS, per the
 * `x-forwarded-proto` header a terminating proxy (or the calling backend) sets.
 * The header may be a comma-separated list; the first entry is the client-facing
 * protocol. Defaults to insecure when the header is absent.
 */
export function isSecureRequest(req: Request): boolean {
  const proto = req.headers["x-forwarded-proto"];
  const first = Array.isArray(proto) ? proto[0] : proto?.split(",")[0];
  return first?.trim() === "https";
}
