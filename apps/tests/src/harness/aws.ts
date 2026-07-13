import { readFileSync } from "node:fs";
import path from "node:path";

import { BROWSER_SERVER_DIR } from "./config";

const AWS_KEYS = [
  "AWS_REGION",
  "AWS_S3_BUCKET",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_ACCESS_KEY",
  "AWS_SECRET_KEY",
];

/**
 * Best-effort AWS/S3 credentials so the recording test can run: read from this
 * process's env, falling back to parsing apps/browser-server/.env. Returns `{}`
 * when nothing usable is found — the recording test then skips itself.
 *
 * Recordings are namespaced under an `e2e-test/` prefix so they don't collide
 * with real recordings in the bucket.
 */
export function loadAwsCreds(): Record<string, string> {
  const found: Record<string, string> = {};
  for (const key of AWS_KEYS) {
    if (process.env[key]) found[key] = process.env[key] as string;
  }

  if (!found.AWS_REGION || !found.AWS_S3_BUCKET) {
    try {
      const file = readFileSync(path.join(BROWSER_SERVER_DIR, ".env"), "utf8");
      for (const line of file.split("\n")) {
        const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        const key = match?.[1];
        if (key && AWS_KEYS.includes(key) && !found[key]) {
          found[key] = match[2] ?? "";
        }
      }
    } catch {
      // No .env to read — recording test will skip.
    }
  }

  if (!found.AWS_REGION || !found.AWS_S3_BUCKET) return {};
  found.AWS_S3_PREFIX = "e2e-test/";
  return found;
}
