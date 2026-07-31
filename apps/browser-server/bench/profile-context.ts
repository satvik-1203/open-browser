/**
 * Prototype: contexts as a persistent Chrome profile directory instead of a
 * cookie snapshot. Local disk only — no DB, no S3, no schema change.
 *
 *   pnpm --filter browser-server context:profile login  <name>   # log in, then archive
 *   pnpm --filter browser-server context:profile open   <name>   # restore + probe, save back
 *   pnpm --filter browser-server context:profile open   <name> --read-only
 *
 * The point of this shape is that the profile carries what a cookie snapshot
 * cannot: the device-bound session key Google requires, plus IndexedDB and the
 * rest. So bound sessions are deliberately left ENABLED here — disabling them
 * is only a workaround for the snapshot approach.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { defaultLaunchOptions } from "@/services/browser/pool";

puppeteer.use(StealthPlugin());

const STORE = path.resolve(".profiles");
const [command, name, ...flags] = process.argv.slice(2);
if (!command || !name) throw new Error("usage: profile-context.ts <login|open> <name> [--read-only]");
const readOnly = flags.includes("--read-only");
const archive = path.join(STORE, `${name}.tar.gz`);

/**
 * Caches are the bulk of a profile and none of it is login state. Dropping them
 * is what makes the artifact a plausible size to store per context.
 */
const PRUNE = [
  "Default/Cache", "Default/Code Cache", "Default/GPUCache", "Default/DawnGraphiteCache",
  "Default/DawnWebGPUCache", "Default/Service Worker/CacheStorage", "Default/Service Worker/ScriptCache",
  "GrShaderCache", "ShaderCache", "GraphiteDawnCache", "component_crx_cache", "extensions_crx_cache",
];

const du = (dir: string): string =>
  execFileSync("du", ["-sh", dir]).toString().split("\t")[0]!.trim();

function launchOptions(userDataDir: string) {
  const base = defaultLaunchOptions();
  return {
    ...base,
    headless: false,
    userDataDir,
    // Bound sessions are the whole reason for this approach — leave them on.
    args: base.args!.filter((a) => !a.includes("DeviceBoundSessions")),
  };
}

/** Restore the stored profile into a throwaway dir, or start empty. */
function materialize(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `profile-${name}-`));
  if (fs.existsSync(archive)) {
    execFileSync("tar", ["xzf", archive, "-C", dir]);
    console.log(`restored ${archive} (${du(dir)} unpacked)`);
  } else {
    console.log(`no archive at ${archive}; starting from an empty profile`);
  }
  return dir;
}

/**
 * Archive the profile. MUST run with Chrome fully exited: the profile is a set
 * of SQLite and LevelDB stores, and copying them from under a live browser
 * yields a torn, sometimes unusable snapshot. This is the fundamental
 * difference from cookie capture, which was safe on a running browser.
 */
function store(dir: string) {
  fs.mkdirSync(STORE, { recursive: true });
  for (const rel of PRUNE) fs.rmSync(path.join(dir, rel), { recursive: true, force: true });
  const tmp = `${archive}.tmp`;
  // Write to a temp name and rename, so an interrupted save can never replace a
  // working profile with a truncated one.
  execFileSync("tar", ["czf", tmp, "-C", dir, "."]);
  fs.renameSync(tmp, archive);
  const bytes = fs.statSync(archive).size;
  console.log(`saved ${archive} — ${(bytes / 1024 / 1024).toFixed(1)} MB compressed (${du(dir)} on disk)`);
}

const dir = materialize();
const browser = await puppeteer.launch(launchOptions(dir));
const page = (await browser.pages())[0]!;

if (command === "login") {
  const done = path.join(dir, "DONE");
  await page.goto("https://accounts.google.com/").catch(() => {});
  console.log(`\nLog in, then: touch ${done}`);
  while (!fs.existsSync(done)) await new Promise((r) => setTimeout(r, 2000));
  fs.rmSync(done, { force: true });
  await browser.close();
  store(dir);
} else {
  await page.goto("https://mail.google.com/", { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});
  const url = page.url();
  const signedIn = !/accounts\.google\.com\/(ServiceLogin|v3\/signin|InteractiveLogin)/.test(url);
  console.log(`\n${signedIn ? "SIGNED IN " : "SIGNED OUT"}  ${url.slice(0, 100)}`);
  // Give any post-load session termination a chance to fire — the failure mode
  // was always "loads, then signs out a moment later".
  await new Promise((r) => setTimeout(r, 12_000));
  await page.reload({ waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});
  const after = page.url();
  const stillIn = !/accounts\.google\.com\/(ServiceLogin|v3\/signin|InteractiveLogin)/.test(after);
  console.log(`after 12s + reload: ${stillIn ? "STILL SIGNED IN" : "SIGNED OUT"}  ${after.slice(0, 100)}`);
  await browser.close();
  if (!readOnly) store(dir);
}

fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
