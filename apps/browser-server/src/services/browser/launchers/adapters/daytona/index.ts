import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Daytona, type Sandbox } from "@daytonaio/sdk";
import { logger } from "@repo/logger";
import type { Browser } from "puppeteer";

import { chromeArgs } from "@/services/browser/launchers/chromeArgs";
import { puppeteer } from "@/services/browser/launchers/puppeteer";
import type {
  BrowserLauncher,
  LaunchedBrowser,
  LauncherProvider,
  LaunchSpec,
} from "@/services/browser/launchers/types";
import { WarmSandboxPool } from "@/services/browser/launchers/adapters/daytona/warmPool";
import { PROFILE_PRUNE_DIRS } from "@/services/context/index";

/** Where Chrome's user data directory lives inside the sandbox. */
const PROFILE_DIR = "/tmp/ob-profile";
/** Remote paths for the profile tarballs moving in and out. */
const INBOUND_ARCHIVE = "/tmp/ob-profile-in.tar.gz";
const OUTBOUND_ARCHIVE = "/tmp/ob-profile-out.tar.gz";
/** Session name for the long-running Chrome command. */
const CHROME_SESSION = "chrome";
/** Chrome's stderr inside the sandbox, quoted back when a launch fails. */
const CHROME_LOG = "/tmp/chrome.log";

/** How long to wait for Chrome's CDP endpoint to answer through the proxy. */
const CDP_READY_TIMEOUT_MS = 30_000;
const CDP_POLL_INTERVAL_MS = 300;

/**
 * A Chrome running inside a per-session Daytona sandbox.
 *
 * One sandbox per session, destroyed when the session ends. That is the whole
 * point: Chrome's process tree stops being *this* server's process tree, so the
 * host's cgroup pid ceiling no longer bounds concurrency — this process only
 * holds a WebSocket per session. It also means a crashed or wedged Chrome can
 * never leak into the next session, because there is no next session in that
 * sandbox.
 */
class DaytonaBrowser implements LaunchedBrowser {
  constructor(
    readonly browser: Browser,
    private readonly sandbox: Sandbox,
    private readonly previewUrl: string,
    private readonly previewToken: string | undefined,
    private readonly hasProfile: boolean,
  ) {}

  wsEndpoint(): string {
    return `${this.previewUrl.replace(/^https/, "wss")}${this.browserWsPath}`;
  }

  pageWsEndpoint(targetId: string): string {
    return `${this.previewUrl.replace(/^https/, "wss")}/devtools/page/${targetId}`;
  }

  httpEndpoint(): string {
    return this.previewUrl;
  }

  wsHeaders(): Record<string, string> | undefined {
    return this.previewToken
      ? { "x-daytona-preview-token": this.previewToken }
      : undefined;
  }

  /** Path of the browser-level CDP endpoint, captured at connect time. */
  browserWsPath = "";

  async exportProfile(): Promise<string | undefined> {
    if (!this.hasProfile) return undefined;

    // Prune and tar *inside* the sandbox. Doing it here rather than after the
    // download is the difference between moving ~2MB of real login state and
    // ~136MB of regenerable cache across the network on every session end.
    const prune = PROFILE_PRUNE_DIRS.map(
      (rel) => `rm -rf '${PROFILE_DIR}/${rel}'`,
    ).join(" ; ");
    const result = await this.sandbox.process.executeCommand(
      `${prune} ; cd '${PROFILE_DIR}' && tar czf '${OUTBOUND_ARCHIVE}' . && stat -c %s '${OUTBOUND_ARCHIVE}'`,
    );
    const sizeBytes = Number((result.result ?? "").trim().split("\n").pop());
    logger.info("context profile packed in sandbox", {
      sandboxId: this.sandbox.id,
      sizeBytes,
    });

    const buffer = await this.sandbox.fs.downloadFile(OUTBOUND_ARCHIVE);
    const tarPath = path.join(
      os.tmpdir(),
      `ob-profile-${this.sandbox.id}.tar.gz`,
    );
    await fs.writeFile(tarPath, buffer);
    return tarPath;
  }

  async usage() {
    // Chrome's process tree lives on another machine, so nothing in this
    // process can sample it. Reported as unmeasurable rather than as zero-usage
    // so `/browser/metrics` can't be mistaken for a real reading.
    return undefined;
  }

  async dispose(): Promise<void> {
    try {
      await this.browser.disconnect();
    } catch {
      // Already gone; the sandbox delete below is what actually frees anything.
    }
    try {
      await this.sandbox.delete();
      logger.info("sandbox destroyed", { sandboxId: this.sandbox.id });
    } catch (error) {
      // A leaked sandbox costs money until its auto-stop interval reaps it, but
      // failing teardown here would strand the session instead.
      logger.error("sandbox delete failed; relying on auto-stop", {
        sandboxId: this.sandbox.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

interface DaytonaConfig {
  apiKey: string;
  apiUrl?: string;
  snapshot: string;
  cdpPort: number;
  autoStopMinutes: number;
}

class DaytonaLauncher implements BrowserLauncher {
  readonly name = "daytona";
  private readonly daytona: Daytona;
  private readonly pool: WarmSandboxPool;

  constructor(private readonly config: DaytonaConfig) {
    this.daytona = new Daytona({
      apiKey: config.apiKey,
      ...(config.apiUrl ? { apiUrl: config.apiUrl } : {}),
    });
    this.pool = new WarmSandboxPool(() => this.allocate());
  }

  /** Allocate one sandbox from the configured snapshot. */
  private allocate(): Promise<Sandbox> {
    return this.daytona.create(
      {
        snapshot: this.config.snapshot,
        // A safety net, not the teardown path: `dispose()` deletes the sandbox
        // when the session ends. This only catches sandboxes orphaned by a
        // server crash, which would otherwise bill forever.
        autoStopInterval: this.config.autoStopMinutes,
      },
      { timeout: 240 },
    );
  }

  /** Pre-allocate sandboxes at boot. No-op while pooling is off. */
  warmUp(): void {
    this.pool.refill();
  }

  /** Destroy idle pooled sandboxes; they belong to no session. */
  async shutdown(): Promise<void> {
    await this.pool.drain();
  }

  async launch(spec: LaunchSpec): Promise<LaunchedBrowser> {
    const started = Date.now();
    // A pooled sandbox has already paid Daytona's allocation cost — the bimodal
    // ~1s/~21s that is the whole tail of a cold start.
    const pooled = this.pool.take();
    const sandbox = pooled ?? (await this.allocate());
    // Label after the fact so a pooled sandbox (allocated before any session
    // existed) is still traceable to the session that claimed it.
    await sandbox
      .setLabels({ "ob-session": spec.id })
      .catch(() => {});

    try {
      if (spec.profileArchive) {
        await sandbox.fs.uploadFile(
          await fs.readFile(spec.profileArchive),
          INBOUND_ARCHIVE,
        );
        // `|| true`: an unreadable archive (e.g. a pre-profiles context still
        // pointing at a cookie snapshot) must start clean rather than fail the
        // session — same tolerance the local adapter has.
        await sandbox.process.executeCommand(
          `mkdir -p '${PROFILE_DIR}' && tar xzf '${INBOUND_ARCHIVE}' -C '${PROFILE_DIR}' || true`,
        );
      }

      await this.startChrome(sandbox, spec);
      const preview = await sandbox.getPreviewLink(this.config.cdpPort);
      const previewToken: string | undefined = preview.token;
      const headers = previewToken
        ? { "x-daytona-preview-token": previewToken }
        : undefined;

      const version = await waitForCdp(preview.url, headers, sandbox);

      const wsPath = new URL(version.webSocketDebuggerUrl).pathname;
      const browser = await puppeteer.connect({
        browserWSEndpoint: `${preview.url.replace(/^https/, "wss")}${wsPath}`,
        ...(headers ? { headers } : {}),
        defaultViewport: null,
      });

      const launched = new DaytonaBrowser(
        browser,
        sandbox,
        preview.url,
        previewToken,
        Boolean(spec.profileArchive),
      );
      launched.browserWsPath = wsPath;

      // Where this session's Chrome physically is. Shares `launcher`/`location`
      // /`ms` with the local adapter's log so one query covers both backends —
      // and names the sandbox, which is the handle you need to go look at (or
      // bill, or kill) the machine a given session ran on.
      logger.info("browser launched", {
        id: spec.id,
        launcher: this.name,
        location: `daytona sandbox ${sandbox.id}`,
        sandboxId: sandbox.id,
        // The Daytona region/target this sandbox landed in, when the SDK
        // reports one — a session that feels slow is often just far away.
        target: sandbox.target ?? null,
        cdpEndpoint: preview.url,
        chromeVersion: version.Browser,
        headless: spec.headless,
        warm: Boolean(pooled),
        poolDepth: this.pool.depth,
        ms: Date.now() - started,
      });
      return launched;
    } catch (error) {
      // Nothing references the sandbox yet, so it would bill until auto-stop.
      await sandbox.delete().catch(() => {});
      throw error;
    }
  }

  /**
   * Start Chrome as a long-running session command.
   *
   * Not `executeCommand`: that holds its HTTP request open until the command
   * exits, so backgrounding Chrome under it dies with "socket hang up" the
   * moment the SDK's request times out. The session API is the supported way to
   * run something that outlives the call.
   */
  private async startChrome(sandbox: Sandbox, spec: LaunchSpec): Promise<void> {
    await sandbox.process.createSession(CHROME_SESSION);

    // Headful needs a virtual display. Headful is the default because it is
    // markedly less bot-detectable — the UA reports `Chrome/…` rather than
    // `HeadlessChrome/…`, and the snapshot ships xvfb for exactly this.
    const display = spec.headless
      ? ""
      : 'xvfb-run -a --server-args="-screen 0 1920x1080x24" ';
    const mode = spec.headless ? "--headless=new " : "";

    // No `ignoreDefaultArgs` equivalent is needed here: this command line is
    // built from scratch, so puppeteer's automation flags are never added in
    // the first place.
    const args = [
      ...chromeArgs(spec, { userDataDir: PROFILE_DIR, noSandbox: true }),
      `--remote-debugging-port=${this.config.cdpPort}`,
      // Bind beyond loopback so Daytona's proxy can reach it, and accept the
      // proxied Origin. The sandbox is single-tenant and reachable only through
      // an authenticated preview URL, so this is not a public exposure.
      "--remote-debugging-address=0.0.0.0",
      "--remote-allow-origins=*",
    ];

    await sandbox.process.executeSessionCommand(CHROME_SESSION, {
      // Chrome's stderr goes to a file rather than the session log so that
      // `waitForCdp` can quote it verbatim when a launch fails.
      command: `mkdir -p '${PROFILE_DIR}' && ${display}google-chrome ${mode}${args.join(" ")} about:blank > ${CHROME_LOG} 2>&1`,
      runAsync: true,
    });
  }
}

interface CdpVersion {
  webSocketDebuggerUrl: string;
  Browser: string;
}

/** Poll the sandbox's CDP endpoint until it answers, or give up with its log. */
async function waitForCdp(
  previewUrl: string,
  headers: Record<string, string> | undefined,
  sandbox: Sandbox,
): Promise<CdpVersion> {
  const deadline = Date.now() + CDP_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await fetch(`${previewUrl}/json/version`, {
      ...(headers ? { headers } : {}),
    }).catch(() => null);
    if (response?.ok) return (await response.json()) as CdpVersion;
    await new Promise((resolve) => setTimeout(resolve, CDP_POLL_INTERVAL_MS));
  }

  // Chrome's own stderr is the only thing that explains a failure to start
  // (a missing display, an OOM kill), so surface it rather than a bare timeout.
  const log = await sandbox.process
    .executeCommand(`tail -30 /tmp/chrome.log 2>/dev/null || true`)
    .then((r) => r.result ?? "")
    .catch(() => "");
  throw new Error(
    `chrome CDP did not become ready within ${CDP_READY_TIMEOUT_MS}ms${log ? `: ${log}` : ""}`,
  );
}

export const daytonaLauncherProvider: LauncherProvider = {
  name: "daytona",
  fromEnv(): BrowserLauncher | undefined {
    const apiKey = process.env.DAYTONA_API_KEY;
    if (!apiKey) return undefined;

    // `DAYTONA_CHROME_URL` is the older name this setting shipped under and is
    // still read so an existing deployment keeps working after an upgrade.
    const snapshot =
      process.env.DAYTONA_SNAPSHOT ?? process.env.DAYTONA_CHROME_URL;
    if (!snapshot) {
      logger.warn(
        "DAYTONA_API_KEY is set but DAYTONA_SNAPSHOT is not; falling back to local browsers",
      );
      return undefined;
    }

    return new DaytonaLauncher({
      apiKey,
      apiUrl: process.env.DAYTONA_URL,
      snapshot,
      cdpPort: Number(process.env.DAYTONA_CDP_PORT ?? 9222),
      autoStopMinutes: Number(process.env.DAYTONA_AUTO_STOP_MINUTES ?? 15),
    });
  },
};
