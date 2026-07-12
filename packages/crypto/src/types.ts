/**
 * Decrypted contents of an API token. The token string handed to users is the
 * AES-256-GCM encryption of this object.
 *
 * `orgId` is intentionally omitted for now (no org model exists yet). When it
 * lands, add it here as an optional field — existing tokens decrypt to a
 * payload without it, so older tokens keep working.
 */
export interface TokenPayload {
  userId: string;
  /** Primary key of the `api_token` row, used for revocation lookups. */
  tokenId: string;
}
