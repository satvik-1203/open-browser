import type { Browser } from "puppeteer";
import type { ProxyOptions } from "@repo/types";

/**
 * Everything a launcher needs to produce a browser. Deliberately describes the
 * *browser* and not how to get one — the same spec has to be satisfiable by a
 * local Chrome process and by a Chrome running inside a remote sandbox.
 */
export interface LaunchSpec {
  /** Session id, used to label the underlying runtime for traceability. */
  id: string;
  headless: boolean;
  /** UI language; baked into the launch because Chrome reads it at startup. */
  lang: string;
  proxy?: ProxyOptions;
  /**
   * Local path to a `.tar.gz` of a Chromium user data directory to start from.
   * The launcher is responsible for getting it wherever Chrome can read it —
   * extracted on disk locally, or uploaded into the sandbox remotely.
   */
  profileArchive?: string;
}

/**
 * A live browser plus the handle to whatever is hosting it.
 *
 * The point of this seam is that `startBrowser` never learns whether Chrome is
 * a child process or a container on another machine. Everything host-specific —
 * how you reach its CDP endpoint, how you get its profile back, how you tear it
 * down — is answered here.
 */
export interface LaunchedBrowser {
  /** Connected puppeteer handle. */
  readonly browser: Browser;
  /** Browser-level CDP endpoint the devtools proxy dials. */
  wsEndpoint(): string;
  /** Per-page CDP endpoint for a target id. */
  pageWsEndpoint(targetId: string): string;
  /**
   * HTTP origin of Chrome's own DevTools endpoint — where `/json/*` and the
   * bundled inspector frontend live. Separate from `wsEndpoint()` because a
   * remote runtime reaches Chrome through a proxy whose URL has no port to
   * borrow, so deriving one from the ws endpoint silently produces a dead
   * loopback address.
   */
  httpEndpoint(): string;
  /**
   * Headers required to reach the endpoints above. Remote runtimes put their
   * auth here; the local one has none, which is why it is optional rather than
   * an empty object every caller has to think about.
   */
  wsHeaders(): Record<string, string> | undefined;
  /**
   * Pack this browser's profile and return a LOCAL path to the tarball, or
   * `undefined` when the runtime has no profile to save.
   *
   * MUST be called with the browser fully exited — a Chromium profile is a set
   * of SQLite and LevelDB stores, and archiving one from under a live browser
   * yields a torn snapshot that may not open. The pruning of regenerable cache
   * belongs to the implementation because it is far cheaper to do it *before*
   * the bytes cross the network than after.
   */
  exportProfile(): Promise<string | undefined>;
  /**
   * Resource usage for this browser, or `undefined` when the host cannot be
   * measured from this process (anything remote).
   */
  usage(): Promise<{ pid: number | null; cpuPercent: number; memoryBytes: number } | undefined>;
  /**
   * Release the host: kill the process, destroy the sandbox. Never throws —
   * teardown runs on paths that must not fail, and a leaked sandbox is a cost
   * problem to log, not a reason to abort a session's end.
   */
  dispose(): Promise<void>;
}

/** Produces browsers on one kind of host. */
export interface BrowserLauncher {
  /** Discriminator for logs/errors, e.g. "daytona". */
  readonly name: string;
  launch(spec: LaunchSpec): Promise<LaunchedBrowser>;
  /**
   * Optional: do any pre-allocation now that the server is accepting traffic.
   * Not awaited — a start that arrives first just does the work inline.
   */
  warmUp?(): void;
  /**
   * Optional: release resources the launcher holds outside any session (e.g.
   * pooled sandboxes, which belong to no session and would otherwise bill on
   * past a shutdown).
   */
  shutdown?(): Promise<void>;
}

/**
 * A pluggable launcher backend. Each lives in its own folder under `adapters/`
 * and exports one of these; register it in `getLauncher.ts`. Mirrors the
 * storage adapter registry so there is one shape to learn, not two.
 */
export interface LauncherProvider {
  readonly name: string;
  /** Build from the environment, or `undefined` when unconfigured. */
  fromEnv(): BrowserLauncher | undefined;
}
