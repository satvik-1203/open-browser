/**
 * Write the synthetic context snapshot the start bench loads.
 *
 *   pnpm --filter browser-server bench:seed
 */
import "dotenv/config";
import { gzipSync } from "node:zlib";

import { getStorage } from "@/services/storage/index";

import { BENCH_SNAPSHOT_KEY, buildSnapshot } from "./fixture";

async function main() {
  const storage = getStorage();
  if (!storage) throw new Error("storage is not configured (check .env)");

  const state = buildSnapshot();
  const body = gzipSync(Buffer.from(JSON.stringify(state), "utf8"));
  await storage.adapter.store({
    key: BENCH_SNAPSHOT_KEY,
    body,
    contentType: "application/json",
  });

  console.log(
    `seeded ${BENCH_SNAPSHOT_KEY}: ${state.cookies.length} cookies, ` +
      `${state.origins.length} origins, ${body.byteLength} bytes gzipped`,
  );
}

void main();
