import type { LaunchSpec } from "@/services/browser/launchers/types";

/**
 * The Chrome flags every launcher passes, wherever the browser runs.
 *
 * Shared rather than duplicated per adapter because these encode the product's
 * two hard requirements — don't look automated, and agree with the emulated
 * identity — and an adapter that quietly drifted from them would be a browser
 * that fingerprints differently depending on which host it happened to land on.
 *
 * `userDataDir` is passed as a flag rather than puppeteer's `userDataDir`
 * option on purpose: with the option, puppeteer's temp-profile cleanup deletes
 * the directory on `close()`, which destroyed real saved profiles. Chromium
 * reads the flag identically.
 */
export function chromeArgs(
  spec: LaunchSpec,
  options: { userDataDir?: string; noSandbox?: boolean } = {},
): string[] {
  return [
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    // Chrome bakes its UI language into some surfaces before any CDP override
    // can run, so the launch flag has to agree with the emulated locale.
    `--lang=${spec.lang}`,
    ...(options.userDataDir ? [`--user-data-dir=${options.userDataDir}`] : []),
    ...(options.noSandbox ? ["--no-sandbox", "--disable-setuid-sandbox"] : []),
    ...(spec.proxy ? [`--proxy-server=${spec.proxy.server}`] : []),
  ];
}

/** Flags puppeteer adds that we strip, because they advertise automation. */
export const IGNORED_DEFAULT_ARGS = ["--enable-automation"];
