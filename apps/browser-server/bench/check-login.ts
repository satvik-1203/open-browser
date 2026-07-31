/** Start a real write-mode session on a context and report Google login state. */
import "dotenv/config";
import puppeteer from "puppeteer";
const BASE = "http://localhost:3001";
const T = { "content-type": "application/json", "browser-server-bypass-token": process.env.BROWSER_SERVER_BYPASS_TOKEN! };
const CB = { "x-callback-token": process.env.BACKEND_CALLBACK_TOKEN! };
const id = process.argv[2]!;
const slot = async () => (await (await fetch(`${process.env.BACKEND_CALLBACK_URL}/internal/context/${id}`, { headers: CB })).json()) as { version: number; snapshotKey: string };

const before = await slot();
const s = (await (await fetch(`${BASE}/browser/start`, { method: "POST", headers: T, body: JSON.stringify({ headless: false, context: { id, loadKey: before.snapshotKey, persist: true } }) })).json()) as { id: string; webSocketDebuggerUrl: string };
const b = await puppeteer.connect({ browserWSEndpoint: s.webSocketDebuggerUrl });
const p = (await b.pages())[0]!;
await p.goto("https://mail.google.com/", { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});
const url = p.url();
const inbox = !/accounts\.google\.com\/(ServiceLogin|v3\/signin|InteractiveLogin)/.test(url);
console.log(`loaded v${before.version} -> ${inbox ? "SIGNED IN" : "SIGNED OUT"}  ${url.slice(0, 80)}`);
await new Promise((r) => setTimeout(r, 10_000));
await p.reload({ waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});
const after = p.url();
console.log(`after 10s + reload: ${!/accounts\.google\.com\/(ServiceLogin|v3\/signin|InteractiveLogin)/.test(after) ? "STILL SIGNED IN" : "SIGNED OUT"}`);
b.disconnect();
await fetch(`${BASE}/browser/stop`, { method: "POST", headers: T, body: JSON.stringify({ id: s.id }) });
await new Promise((r) => setTimeout(r, 9000));
console.log(`saved -> v${(await slot()).version}`);
process.exit(0);
