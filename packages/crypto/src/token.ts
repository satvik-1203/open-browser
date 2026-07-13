import { createHash, randomBytes } from "node:crypto";

// API tokens are `ob_` + 16 url-safe chars (12 random bytes → 16 base64url
// chars). The token is an opaque random secret — we store only its SHA-256 hash
// on the `api_token` row and look it up by that hash, so the raw token is never
// persisted and can't be recovered after it's shown once.
const PREFIX = "ob_";
const SECRET_BYTES = 12;

/** Mint a fresh API token plus the hash to store for it. */
export function generateApiToken(): { token: string; hash: string } {
  const token = PREFIX + randomBytes(SECRET_BYTES).toString("base64url");
  return { token, hash: hashApiToken(token) };
}

/** Hash a token for storage/lookup. Fast (random secret, not a password). */
export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
