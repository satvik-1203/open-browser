import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { logger } from "@repo/logger";
import type { Browser } from "puppeteer";
import pidtree from "pidtree";
import pidusage from "pidusage";

import {
  chromeArgs,
  IGNORED_DEFAULT_ARGS,
} from "@/services/browser/launchers/chromeArgs";
import { puppeteer } from "@/services/browser/launchers/puppeteer";
import type {
  BrowserLauncher,
  LaunchedBrowser,
  LauncherProvider,
  LaunchSpec,
} from "@/services/browser/launchers/types";
import { packProfile } from "@/services/context/index";

const run = promisify(execFile);

/**
 * Runs Chrome as a child process of this server — the original behaviour, kept
 * as an adapter so local development and self-hosted single-box deployments
 * don't need a Daytona account.
 *
 * Note this is exactly the mode whose process count is bounded by the host's
 * cgroup pid limit: every session's ~250 Chrome threads are this container's
 * threads. The Daytona adapter exists because that ceiling is not raisable on
 * a managed platform.
 */
class LocalBrowser implements LaunchedBrowser {
  constructor(
    readonly browser: Browser,
    private readonly profileDir?: string,
  ) {}

  wsEndpoint(): string {
    return this.browser.wsEndpoint();
  }

  pageWsEndpoint(targetId: string): string {
    const port = new URL(this.browser.wsEndpoint()).port;
    return `ws://127.0.0.1:${port}/devtools/page/${targetId}`;
  }

  httpEndpoint(): string {
    const port = new URL(this.browser.wsEndpoint()).port;
    return `http://127.0.0.1:${port}`;
  }

  wsHeaders(): undefined {
    return undefined;
  }

  async exportProfile(): Promise<string | undefined> {
    if (!this.profileDir) return undefined;
    const { tarPath } = await packProfile(this.profileDir);
    return tarPath;
  }

  async usage() {
    const pid = this.browser.process()?.pid ?? null;
    if (pid == null) return { pid, cpuPercent: 0, memoryBytes: 0 };
    // `root: true` includes the browser process itself alongside its renderer /
    // GPU children. If the tree can't be walked, fall back to the main pid.
    const pids = await pidtree(pid, { root: true }).catch(() => [pid]);
    // Processes can exit between being listed and being sampled, so each pid is
    // sampled independently and the dead ones are skipped rather than failing
    // the whole reading.
    const stats = await Promise.all(
      pids.map((p) => pidusage(p).catch(() => null)),
    );
    const live = stats.filter((stat) => stat !== null);
    return {
      pid,
      cpuPercent:
        Math.round(live.reduce((sum, stat) => sum + stat.cpu, 0) * 100) / 100,
      memoryBytes: live.reduce((sum, stat) => sum + stat.memory, 0),
    };
  }

  async dispose(): Promise<void> {
    if (this.browser.connected) {
      await this.browser.close().catch(() => {});
    }
    if (this.profileDir) {
      await fs
        .rm(this.profileDir, { recursive: true, force: true })
        .catch(() => {});
    }
  }
}

class LocalLauncher implements BrowserLauncher {
  readonly name = "local";

  async launch(spec: LaunchSpec): Promise<LaunchedBrowser> {
    const started = Date.now();
    // An empty directory when there is nothing stored yet: the session still
    // needs a profile of its own for `exportProfile` to have anything to pack,
    // which is how a context takes its first save.
    const profileDir = spec.profileArchive
      ? await extractProfile(spec.profileArchive)
      : spec.useProfile
        ? await fs.mkdtemp(path.join(os.tmpdir(), "ob-profile-"))
        : undefined;

    try {
      const browser = await puppeteer.launch({
        headless: spec.headless,
        // Applied per-page by `installViewport` instead, so a custom viewport
        // doesn't change the launch shape.
        defaultViewport: null,
        ignoreDefaultArgs: IGNORED_DEFAULT_ARGS,
        args: chromeArgs(spec, {
          userDataDir: profileDir,
          noSandbox: process.env.PUPPETEER_NO_SANDBOX === "true",
        }),
      });

      // Where this session's Chrome physically is. The counterpart log in the
      // Daytona adapter carries the same `launcher`/`ms` fields, so one query
      // answers "where did this session run, and how long did getting there
      // take" regardless of which backend served it.
      logger.info("browser launched", {
        id: spec.id,
        launcher: this.name,
        location: `${os.hostname()} (this process)`,
        pid: browser.process()?.pid ?? null,
        cdpEndpoint: browser.wsEndpoint(),
        profileDir: profileDir ?? null,
        headless: spec.headless,
        ms: Date.now() - started,
      });
      return new LocalBrowser(browser, profileDir);
    } catch (error) {
      // Nothing owns the directory yet, so a failed launch would leak a whole
      // profile into the temp dir.
      if (profileDir) {
        await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
      }
      throw error;
    }
  }
}

/** Unpack a stored profile into a private directory for this session. */
async function extractProfile(archivePath: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ob-profile-"));
  try {
    await run("tar", ["xzf", archivePath, "-C", dir]);
  } catch (error) {
    // Not a profile archive we can read — the common case is a context written
    // before profiles existed, whose key still points at a cookie snapshot.
    // Start clean rather than fail the session; the next save replaces it.
    logger.warn("context profile unreadable; starting clean", {
      error: error instanceof Error ? error.message : String(error),
    });
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
  }
  return dir;
}

export const localLauncherProvider: LauncherProvider = {
  name: "local",
  // Always available: it is the fallback when nothing remote is configured.
  fromEnv: () => new LocalLauncher(),
};
