import os from "node:os";
import type { ServerMetrics } from "@repo/types";

/** Length of the window used to sample CPU utilization, in milliseconds. */
const CPU_SAMPLE_WINDOW_MS = 100;

interface CpuTotals {
  idle: number;
  total: number;
}

function readCpuTotals(): CpuTotals {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const value of Object.values(cpu.times)) {
      total += value;
    }
    idle += cpu.times.idle;
  }
  return { idle, total };
}

/**
 * Aggregate CPU utilization across all cores, sampled over a short window.
 * Returns a percentage in the range 0–100.
 */
async function sampleCpuUsagePercent(): Promise<number> {
  const start = readCpuTotals();
  await new Promise((resolve) => setTimeout(resolve, CPU_SAMPLE_WINDOW_MS));
  const end = readCpuTotals();

  const idleDelta = end.idle - start.idle;
  const totalDelta = end.total - start.total;
  if (totalDelta <= 0) return 0;

  const usage = (1 - idleDelta / totalDelta) * 100;
  return Math.min(100, Math.max(0, Math.round(usage * 100) / 100));
}

/**
 * Snapshot the host's CPU and memory utilization. CPU usage is measured over a
 * short sampling window, so this resolves after ~{@link CPU_SAMPLE_WINDOW_MS}ms.
 */
export async function getServerMetrics(): Promise<ServerMetrics> {
  const usagePercent = await sampleCpuUsagePercent();

  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  const [one = 0, five = 0, fifteen = 0] = os.loadavg();

  return {
    cpu: {
      cores: os.cpus().length,
      loadAverage: [one, five, fifteen],
      usagePercent,
    },
    memory: {
      totalBytes,
      freeBytes,
      usedBytes,
      usagePercent:
        totalBytes > 0
          ? Math.round((usedBytes / totalBytes) * 10000) / 100
          : 0,
    },
    uptimeSeconds: Math.round(process.uptime()),
  };
}
