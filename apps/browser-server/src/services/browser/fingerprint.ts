import { logger } from "@repo/logger";
import type { FingerprintOptions, ResolvedFingerprint } from "@repo/types";
import type { Browser, Page, Protocol } from "puppeteer";

/** Fallback when the UA names no platform we recognize. */
const DEFAULT_PLATFORM = "Windows";

/**
 * Platform version reported through `Sec-CH-UA-Platform-Version`. Chrome sends
 * a real value here and sites do read it, so an empty string is itself a tell.
 * Windows 10/11 both report `15.0.0` via the UA-CH scheme, which is why that is
 * the safest default: it's what the large majority of real Chrome traffic sends.
 */
const PLATFORM_VERSIONS: Record<string, string> = {
  Windows: "15.0.0",
  macOS: "14.6.1",
  Linux: "6.8.0",
};

/** `navigator.platform` — the legacy value, which must agree with the UA too. */
const NAVIGATOR_PLATFORMS: Record<string, string> = {
  Windows: "Win32",
  macOS: "MacIntel",
  Linux: "Linux x86_64",
};

function inferPlatform(userAgent: string): string {
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "macOS";
  if (/CrOS/i.test(userAgent)) return "Chrome OS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Linux|X11/i.test(userAgent)) return "Linux";
  return DEFAULT_PLATFORM;
}

function majorVersion(userAgent: string): string {
  return /Chrome\/(\d+)/.exec(userAgent)?.[1] ?? "";
}

/**
 * Chrome's `Sec-CH-UA` brand list, including the deliberately-nonsense
 * "GREASE" entry Chrome injects to stop servers hardcoding the list. Real
 * Chrome always sends three brands; sending one or two is a mismatch a
 * fingerprinting script can spot for free.
 */
function brands(version: string): Protocol.Emulation.UserAgentBrandVersion[] {
  return [
    { brand: "Not;A=Brand", version: "99" },
    { brand: "Google Chrome", version },
    { brand: "Chromium", version },
  ];
}

/**
 * Fill in a full identity from whatever the caller supplied, using the real
 * browser's UA as the base so the Chrome version we claim is the Chrome version
 * we are. A UA advertising Chrome 131 from a binary that behaves like Chrome
 * 141 fails any check that compares the two.
 */
export function resolveFingerprint(
  options: FingerprintOptions | undefined,
  realUserAgent: string,
): ResolvedFingerprint {
  // `HeadlessChrome` in the UA is the single most-checked bot signal there is.
  // We launch headful by default so it shouldn't appear, but a caller can pass
  // `headless: true` and would otherwise announce it in every request.
  const base = realUserAgent.replace("HeadlessChrome", "Chrome");
  const userAgent = options?.userAgent ?? base;
  const platform = options?.platform ?? inferPlatform(userAgent);
  const languages =
    options?.languages?.length ? options.languages : ["en-US", "en"];

  return {
    userAgent,
    platform,
    platformVersion:
      options?.platformVersion ?? PLATFORM_VERSIONS[platform] ?? "15.0.0",
    languages,
    locale: options?.locale ?? languages[0] ?? "en-US",
    // UTC is a bad default — it's rare on residential machines and disagrees
    // with almost any exit IP — but we can't do better without geolocating the
    // proxy, so callers pinning a proxy should pin a timezone with it.
    timezone: options?.timezone ?? "America/New_York",
    browserVersion: majorVersion(userAgent),
  };
}

/**
 * `Accept-Language` in Chrome's exact format: the first language plain, the
 * rest with descending q-values. Getting the shape wrong (no q-values, or a
 * value that doesn't match `navigator.languages`) is a common automation tell.
 */
function acceptLanguage(languages: string[]): string {
  return languages
    .map((lang, i) => (i === 0 ? lang : `${lang};q=${(1 - i * 0.1).toFixed(1)}`))
    .join(",");
}

/**
 * Apply the identity to one page/target.
 *
 * All of it goes through a single `Emulation.setUserAgentOverride` because the
 * UA string, the client-hint metadata and `Accept-Language` have to change
 * together — that call is the only place Chrome lets you set them atomically.
 * Puppeteer's `page.setUserAgent` can't set `acceptLanguage`, so we use CDP
 * directly rather than making two half-consistent calls.
 */
export async function applyFingerprint(
  page: Page,
  fingerprint: ResolvedFingerprint,
): Promise<void> {
  const client = await page.createCDPSession();
  try {
    await client.send("Emulation.setUserAgentOverride", {
      userAgent: fingerprint.userAgent,
      acceptLanguage: acceptLanguage(fingerprint.languages),
      platform:
        NAVIGATOR_PLATFORMS[fingerprint.platform] ?? fingerprint.platform,
      userAgentMetadata: {
        brands: brands(fingerprint.browserVersion),
        fullVersionList: brands(fingerprint.browserVersion),
        platform: fingerprint.platform,
        platformVersion: fingerprint.platformVersion,
        architecture: "x86",
        model: "",
        mobile: false,
      },
    });

    // `Intl`, `Date` and `navigator.language` all read from here. A browser
    // claiming en-US from a US proxy while reporting a UTC clock is a
    // contradiction that costs nothing to avoid.
    await client.send("Emulation.setLocaleOverride", {
      locale: fingerprint.locale,
    });
    await client.send("Emulation.setTimezoneOverride", {
      timezoneId: fingerprint.timezone,
    });
  } finally {
    await client.detach().catch(() => {});
  }
}

/**
 * Apply the identity to every target, now and for the life of the session.
 *
 * Applying it only to the first page is a leak with a sharp edge: a popup or a
 * new tab (an OAuth window, say) would present the untouched identity, so the
 * same "user" would appear to change browsers mid-login.
 */
export async function installFingerprint(
  browser: Browser,
  options: FingerprintOptions | undefined,
): Promise<ResolvedFingerprint> {
  const fingerprint = resolveFingerprint(options, await browser.userAgent());

  browser.on("targetcreated", (target) => {
    void (async () => {
      try {
        const page = await target.page();
        if (page) await applyFingerprint(page, fingerprint);
      } catch (error) {
        logger.debug("fingerprint not applied to new target", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });

  for (const page of await browser.pages()) {
    await applyFingerprint(page, fingerprint);
  }

  logger.info("fingerprint applied", {
    platform: fingerprint.platform,
    browserVersion: fingerprint.browserVersion,
    locale: fingerprint.locale,
    timezone: fingerprint.timezone,
  });
  return fingerprint;
}
