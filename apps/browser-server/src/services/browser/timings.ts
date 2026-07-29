/**
 * Phase timer for the start path.
 *
 * Start latency is the number users feel, and it is spread across a launch, a
 * storage fetch and a variable number of CDP round trips — so "start is slow"
 * is not actionable without knowing which of those moved. Cheap enough
 * (`performance.now()` per phase) to leave on in production, where it's the
 * only way to tell a slow S3 from a slow Chrome.
 */
export class PhaseTimer {
  private readonly start = performance.now();
  private last = this.start;
  private readonly phases: Record<string, number> = {};

  /** Close the phase that ended now, recording its duration in ms. */
  mark(phase: string): void {
    const now = performance.now();
    this.phases[phase] = Math.round(now - this.last);
    this.last = now;
  }

  /** Record a duration measured elsewhere (e.g. work that ran concurrently). */
  set(phase: string, ms: number): void {
    this.phases[phase] = Math.round(ms);
  }

  /** Phase breakdown plus the wall-clock total. */
  report(): Record<string, number> {
    return { ...this.phases, total: Math.round(performance.now() - this.start) };
  }
}

/** Time an awaited step without disturbing the surrounding phase sequence. */
export async function timed<T>(
  timer: PhaseTimer,
  phase: string,
  fn: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await fn();
  } finally {
    timer.set(phase, performance.now() - started);
  }
}
