import { logger } from "@repo/logger";
import type { Sandbox } from "@daytonaio/sdk";

/**
 * How many sandboxes to keep allocated and waiting.
 *
 * **Hardcoded to 0 — pooling is off.** Not an env var on purpose: a warm
 * sandbox bills for as long as it idles, and there is currently no traffic to
 * amortise that against. Making it a knob would invite it being switched on in
 * an environment nobody is watching. Turning it on is a code change and a
 * deploy, which is the right amount of friction for something that costs money
 * while doing nothing.
 *
 * Why it exists at all: `daytona.create` is bimodal. Measured over 8 runs it
 * sits at ~1s six times out of eight and ~21.5s the other two — and the slow
 * pair was constant to within 70ms, which reads like a fixed allocation
 * timeout rather than variable load. Chrome itself is steady at ~1s. So the
 * entire tail of a cold start is *allocation*, and allocation is exactly what
 * can be paid for ahead of time. Set this to 2 and a start stops paying it.
 *
 * But if you are here to cut start latency rather than to cut the tail, look at
 * `installFingerprint` first: it is 34-42% of a non-context start (median
 * ~1.9s), which is more than allocation costs on a good run. Pooling only wins
 * back the ~21s outlier, and it bills continuously to do it.
 */
const WARM_POOL_SIZE = 0;

/**
 * Discard a warm sandbox that has waited this long. Daytona's own auto-stop
 * will eventually reap an idle sandbox out from under us, so one that has sat
 * around is not something to hand to a request expecting a live container.
 * Comfortably inside `DAYTONA_AUTO_STOP_MINUTES` (15 by default).
 */
const MAX_IDLE_MS = 5 * 60_000;

interface WarmSandbox {
  sandbox: Sandbox;
  createdAt: number;
}

/**
 * Sandboxes allocated ahead of a request.
 *
 * Only the *sandbox* is warmed, never the browser inside it. Chrome's flags are
 * derived from the request — headless, language, proxy, whether a profile was
 * restored — so a pre-started Chrome could only be handed to a request that
 * happened to want the identical shape, which is the complexity the old
 * in-process pool carried. An empty sandbox is spec-independent: any request
 * can take any one of them, and Chrome starts in ~1s once it has one.
 *
 * A pooled sandbox is pristine — created, never launched into, never given a
 * profile. Nothing has happened in it, so there is no state to leak between
 * sessions. One is never returned to the pool after a session either; sessions
 * destroy their sandbox and the pool allocates a fresh one.
 */
export class WarmSandboxPool {
  private readonly warm: WarmSandbox[] = [];
  /** In-flight allocations, so concurrent takes don't over-create. */
  private pending = 0;
  private shuttingDown = false;

  constructor(
    private readonly allocate: () => Promise<Sandbox>,
    private readonly size: number = WARM_POOL_SIZE,
  ) {}

  get enabled(): boolean {
    return this.size > 0;
  }

  /** How many sandboxes are ready right now — for logs and tests. */
  get depth(): number {
    return this.warm.length;
  }

  /**
   * Take a ready sandbox, or `undefined` when the caller should allocate its
   * own. Always schedules a refill, so the pool recovers whether or not it hit.
   */
  take(): Sandbox | undefined {
    if (!this.enabled || this.shuttingDown) return undefined;

    let taken: Sandbox | undefined;
    while (this.warm.length > 0) {
      const entry = this.warm.shift();
      if (!entry) break;
      if (Date.now() - entry.createdAt > MAX_IDLE_MS) {
        logger.info("discarding stale warm sandbox", {
          sandboxId: entry.sandbox.id,
        });
        void entry.sandbox.delete().catch(() => {});
        continue;
      }
      taken = entry.sandbox;
      break;
    }

    this.refill();
    return taken;
  }

  /** Top the pool back up, in the background. */
  refill(): void {
    if (!this.enabled || this.shuttingDown) return;
    while (this.warm.length + this.pending < this.size) void this.allocateOne();
  }

  private async allocateOne(): Promise<void> {
    this.pending++;
    try {
      const started = Date.now();
      const sandbox = await this.allocate();
      if (this.shuttingDown) {
        await sandbox.delete().catch(() => {});
        return;
      }
      this.warm.push({ sandbox, createdAt: Date.now() });
      logger.info("warm sandbox ready", {
        sandboxId: sandbox.id,
        ms: Date.now() - started,
        depth: this.warm.length,
      });
    } catch (error) {
      // Pooling is an optimization; failing to pre-allocate must never break
      // starts. They fall back to allocating inline, which is the unpooled path.
      logger.warn("warm sandbox allocation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.pending--;
    }
  }

  /**
   * Destroy every idle sandbox. Called on shutdown: a warm sandbox belongs to
   * no session, so nothing else would ever delete it and it would bill until
   * Daytona's auto-stop reaped it.
   */
  async drain(): Promise<void> {
    this.shuttingDown = true;
    const entries = this.warm.splice(0, this.warm.length);
    if (entries.length === 0) return;
    logger.info("draining warm sandboxes", { count: entries.length });
    await Promise.all(
      entries.map((entry) => entry.sandbox.delete().catch(() => {})),
    );
  }
}
