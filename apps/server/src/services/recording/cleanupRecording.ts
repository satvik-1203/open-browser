import { rm } from "node:fs/promises";

/** Remove a capture's temp directory (frames + encoded mp4). Best-effort. */
export async function cleanupRecording(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
