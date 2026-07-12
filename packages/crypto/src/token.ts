import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import type { TokenPayload } from "./types";

// Token layout (before base64url + prefix): iv(12) | authTag(16) | ciphertext.
const PREFIX = "ob_";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

/**
 * Parse `API_TOKEN_ENCRYPTION_KEY` into a 32-byte key. Accepts either 64-char
 * hex or base64 (standard or url-safe). The parsed key is cached so we only
 * validate once per process.
 */
function resolveKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.API_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("API_TOKEN_ENCRYPTION_KEY is not set");
  }

  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `API_TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}); use 64 hex chars or a base64 32-byte key`,
    );
  }

  cachedKey = key;
  return key;
}

/**
 * Encrypt a token payload into an opaque `ob_…` string. Only the dashboard
 * calls this (when minting a token); the backend only decrypts.
 */
export function encryptToken(payload: TokenPayload): string {
  const key = resolveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

/**
 * Decrypt an `ob_…` token back into its payload. Throws on any tampering, a
 * wrong key, or a malformed token — callers should treat a throw as "reject
 * with 401" and never leak the reason.
 */
export function decryptToken(token: string): TokenPayload {
  const key = resolveKey();

  if (!token.startsWith(PREFIX)) {
    throw new Error("invalid token format");
  }

  const packed = Buffer.from(token.slice(PREFIX.length), "base64url");
  if (packed.length < IV_BYTES + TAG_BYTES) {
    throw new Error("invalid token payload");
  }

  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = packed.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf8")) as TokenPayload;
}
