import { logger } from "@repo/logger";

import { daytonaLauncherProvider } from "@/services/browser/launchers/adapters/daytona/index";
import { localLauncherProvider } from "@/services/browser/launchers/adapters/local/index";
import type {
  BrowserLauncher,
  LauncherProvider,
} from "@/services/browser/launchers/types";

/**
 * Registered launcher backends, in priority order: the first one configured in
 * the environment wins. `local` is last and always configures, so it is the
 * fallback rather than a choice.
 *
 * Adding a backend is a two-step change — drop a folder under `adapters/` and
 * add its provider here — exactly like `getStorage.ts`.
 */
const providers: LauncherProvider[] = [
  daytonaLauncherProvider,
  localLauncherProvider,
];

let cached: BrowserLauncher | undefined;

/**
 * The browser launcher this server resolved from its environment.
 *
 * `BROWSER_LAUNCHER` pins a specific backend by name; without it the first
 * configured provider wins. Pinning exists so a misconfigured Daytona key
 * fails loudly instead of silently falling back to local browsers and
 * quietly reintroducing the pid ceiling the sandbox was meant to escape.
 */
export function getLauncher(): BrowserLauncher {
  if (cached) return cached;

  const pinned = process.env.BROWSER_LAUNCHER;
  if (pinned) {
    const provider = providers.find((candidate) => candidate.name === pinned);
    if (!provider) {
      throw new Error(
        `BROWSER_LAUNCHER="${pinned}" is not a known launcher (have: ${providers
          .map((p) => p.name)
          .join(", ")})`,
      );
    }
    const launcher = provider.fromEnv();
    if (!launcher) {
      throw new Error(
        `BROWSER_LAUNCHER="${pinned}" is not configured in this environment`,
      );
    }
    cached = launcher;
  } else {
    for (const provider of providers) {
      const launcher = provider.fromEnv();
      if (launcher) {
        cached = launcher;
        break;
      }
    }
  }

  if (!cached) throw new Error("no browser launcher is configured");
  return cached;
}

/** Log which backend browsers will run on, at boot. */
export function logLauncherStatus(): void {
  try {
    logger.info("browser launcher", { launcher: getLauncher().name });
  } catch (error) {
    logger.error("browser launcher misconfigured", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
