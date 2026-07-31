/**
 * End-to-end context round-trip through the real API: write state in session 1,
 * confirm session 2 loads it, and confirm a read-only session doesn't clobber it.
 */
import "dotenv/config";
import puppeteer from "puppeteer";

const BASE = "http://localhost:3001";
const TOKEN = process.env.BROWSER_SERVER_BYPASS_TOKEN!;
const CB = { "x-callback-token": process.env.BACKEND_CALLBACK_TOKEN! };
const contextId = process.argv[2]!;
const SITE = "https://example.com";

const api = async (path: string, body: unknown) =>
  (await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "browser-server-bypass-token": TOKEN },
    body: JSON.stringify(body),
  })).json() as Promise<{ id: string; webSocketDebuggerUrl: string }>;

const slot = async () =>
  (await (await fetch(`${process.env.BACKEND_CALLBACK_URL}/internal/context/${contextId}`, { headers: CB })).json()) as
    { version: number; snapshotKey: string | null };

async function session(label: string, persist: boolean, fn: (p: puppeteer.Page) => Promise<void>) {
  const { version, snapshotKey } = await slot();
  const s = await api("/browser/start", { headless: false, context: { id: contextId, loadKey: snapshotKey ?? undefined, persist } });
  const browser = await puppeteer.connect({ browserWSEndpoint: s.webSocketDebuggerUrl });
  const page = (await browser.pages())[0]!;
  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await fn(page);
  browser.disconnect();
  await api("/browser/stop", { id: s.id });
  await new Promise((r) => setTimeout(r, 8000));
  const after = await slot();
  console.log(`${label}: loaded v${version} -> now v${after.version} (${after.snapshotKey})`);
  return after;
}

await session("1 write  ", true, async (p) => {
  await p.evaluate(() => localStorage.setItem("roundtrip", "hello-from-session-1"));
  console.log("   wrote localStorage.roundtrip");
});

await session("2 verify ", true, async (p) => {
  const v = await p.evaluate(() => localStorage.getItem("roundtrip"));
  console.log(`   read back: ${v === "hello-from-session-1" ? "PASS" : `FAIL (${v})`}`);
  await p.evaluate(() => localStorage.setItem("second", "yes"));
});

await session("3 readonly", false, async (p) => {
  const v = await p.evaluate(() => [localStorage.getItem("roundtrip"), localStorage.getItem("second")].join("|"));
  console.log(`   read back: ${v === "hello-from-session-1|yes" ? "PASS" : `FAIL (${v})`}`);
  await p.evaluate(() => localStorage.setItem("shouldNotPersist", "1"));
});

await session("4 confirm", false, async (p) => {
  const leaked = await p.evaluate(() => localStorage.getItem("shouldNotPersist"));
  console.log(`   read-only did not write back: ${leaked === null ? "PASS" : "FAIL"}`);
});
process.exit(0);
