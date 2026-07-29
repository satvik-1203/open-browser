/**
 * The synthetic context snapshot the start bench measures against.
 *
 * Sized like a real logged-in profile rather than a toy one: a Google session
 * alone spans six origins and carries dozens of cookies, and the restore path's
 * cost is per-origin, so a one-origin fixture would measure nothing.
 */
import type { StorageState } from "@repo/types";

export const BENCH_CONTEXT_ID = "bench-context";
export const BENCH_SNAPSHOT_KEY = `contexts/${BENCH_CONTEXT_ID}/1.json.gz`;

const DOMAINS = [
  ".google.com",
  ".accounts.google.com",
  ".mail.google.com",
  ".youtube.com",
  ".drive.google.com",
  ".docs.google.com",
];

const ORIGINS = [
  "https://www.google.com",
  "https://accounts.google.com",
  "https://mail.google.com",
  "https://www.youtube.com",
  "https://drive.google.com",
  "https://docs.google.com",
];

function token(length: number, seed: string): string {
  let out = "";
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  for (let i = 0; i < length; i++) {
    out +=
      alphabet[(seed.charCodeAt(i % seed.length) * (i + 7)) % alphabet.length];
  }
  return out;
}

export function buildSnapshot(): StorageState {
  const cookies = DOMAINS.flatMap((domain) =>
    ["__Secure-1PSID", "__Secure-3PSID", "SID", "HSID", "SAPISID", "NID"].map(
      (name) => ({
        name,
        value: token(96, `${domain}${name}`),
        domain,
        path: "/",
        expires: 4_102_444_800,
        httpOnly: name.startsWith("__Secure") || name === "HSID",
        secure: true,
        sameSite: "None" as const,
      }),
    ),
  );

  const origins = ORIGINS.map((origin) => ({
    origin,
    localStorage: Array.from({ length: 25 }, (_, i) => ({
      name: `key-${i}`,
      value: token(512, `${origin}${i}`),
    })),
  }));

  return { cookies, origins };
}
