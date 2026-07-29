/**
 * Measure start latency against a running browser server.
 *
 * Talks to the server's REST surface directly (not through the dashboard) so
 * the number is the browser server's own cost, without a database round trip
 * or Next.js in the way. Every started browser is stopped again, so the bench
 * leaves nothing running.
 *
 *   pnpm --filter browser-server bench -- --runs 5 --context
 */
import "dotenv/config";

import { BENCH_CONTEXT_ID, BENCH_SNAPSHOT_KEY } from "./fixture";

const base = `http://localhost:${process.env.PORT ?? 3001}`;
const token = process.env.BROWSER_SERVER_BYPASS_TOKEN ?? "";

const args = process.argv.slice(2);
const runs = Number(args[args.indexOf("--runs") + 1]) || 5;
const withContext = args.includes("--context");
const url = args.includes("--url") ? args[args.indexOf("--url") + 1] : undefined;
/**
 * Idle time between runs. Back-to-back starts (gap 0) measure sustained
 * throughput, which is floored by how fast the host can launch Chrome to refill
 * the pool. A gap models interactive use, where the pool has time to recover —
 * the two answer different questions and the difference is the pool's whole point.
 */
const gap = Number(args[args.indexOf("--gap") + 1]) || 0;

async function call(path: string, body: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "browser-server-bypass-token": token,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${text}`);
  return JSON.parse(text) as { id: string };
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))] ?? 0;
}

async function main() {
  const payload: Record<string, unknown> = { headless: false };
  if (url) payload.url = url;
  if (withContext) {
    payload.context = {
      id: BENCH_CONTEXT_ID,
      loadKey: BENCH_SNAPSHOT_KEY,
      persist: false,
    };
  }

  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    const { id } = await call("/browser/start", payload);
    const elapsed = performance.now() - started;
    samples.push(elapsed);
    console.log(`run ${i + 1}: ${elapsed.toFixed(0)}ms`);
    await call("/browser/stop", { id });
    if (gap) await new Promise((resolve) => setTimeout(resolve, gap));
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  console.log(
    `\ncontext=${withContext} runs=${runs} gap=${gap}ms\n` +
      `  mean ${mean.toFixed(0)}ms  min ${sorted[0]?.toFixed(0)}ms  ` +
      `p50 ${percentile(sorted, 50).toFixed(0)}ms  max ${sorted.at(-1)?.toFixed(0)}ms`,
  );
}

void main();
