/**
 * A coherent browser identity.
 *
 * Overriding the user agent on its own makes a browser *more* detectable, not
 * less: Chrome also announces itself through the `Sec-CH-UA*` client-hint
 * headers and through `navigator.platform` / `navigator.languages`, and none of
 * those follow a plain UA override. A UA claiming Windows next to
 * `Sec-CH-UA-Platform: "Linux"` is a far louder signal than the untouched UA
 * would have been. So the fields below are applied together as one identity —
 * derived from each other where possible — rather than exposed as independent
 * knobs.
 */
export interface FingerprintOptions {
  /**
   * Full user-agent string. When omitted, the browser's real UA is used with
   * any `HeadlessChrome` token rewritten to `Chrome`.
   */
  userAgent?: string;
  /**
   * Platform reported to client hints and `navigator.platform`, e.g. `Windows`,
   * `macOS`, `Linux`. Inferred from `userAgent` when omitted.
   */
  platform?: string;
  /** Platform version for `Sec-CH-UA-Platform-Version`, e.g. `15.0.0`. */
  platformVersion?: string;
  /** BCP-47 list for `Accept-Language` and `navigator.languages`. */
  languages?: string[];
  /** IANA timezone, e.g. `America/New_York`. Should match the exit IP's region. */
  timezone?: string;
  /** Locale for `Intl` / `navigator.language`. Defaults to `languages[0]`. */
  locale?: string;
}

/**
 * The identity actually applied to a session, with every field resolved. This
 * is what gets persisted on a context so subsequent sessions present the same
 * browser — a context whose fingerprint drifts between sessions looks like a
 * hijacked account, which is the opposite of what persistence is for.
 */
export interface ResolvedFingerprint extends Required<Omit<FingerprintOptions, "platformVersion">> {
  platformVersion: string;
  /** Chrome major version parsed from the UA; drives the client-hint brands. */
  browserVersion: string;
}
