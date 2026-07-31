/** Upload a local profile archive as the context's next version. */
import "dotenv/config";
import fs from "node:fs/promises";
import { profileArchiveKey, uploadProfile } from "@/services/context/index";

const [contextId, archivePath] = process.argv.slice(2);
const CB = { "x-callback-token": process.env.BACKEND_CALLBACK_TOKEN!, "content-type": "application/json" };
const base = process.env.BACKEND_CALLBACK_URL!;

const slot = (await (await fetch(`${base}/internal/context/${contextId}`, { headers: CB })).json()) as { version: number };
const key = profileArchiveKey(contextId!, slot.version + 1);
const { size } = await fs.stat(archivePath!);

await uploadProfile(archivePath!, key);
const res = await fetch(`${base}/internal/context/${contextId}/commit`, {
  method: "POST",
  headers: CB,
  body: JSON.stringify({ fromVersion: slot.version, key, sizeBytes: size }),
});
console.log(`commit ${res.status}: ${key} (${(size / 1024 / 1024).toFixed(1)} MB) from v${slot.version}`);
process.exit(res.status === 200 ? 0 : 1);
