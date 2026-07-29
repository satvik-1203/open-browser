/**
 * Prove a context restore actually landed, over the same path the bench times.
 *
 * The restore path's failure mode is silence: a navigation that doesn't commit,
 * or a cookie Chrome quietly refuses, leaves a browser that looks started and
 * is logged out. So the speed work needs a correctness check next to it that
 * reads the state back out of a real started browser.
 *
 *   pnpm --filter browser-server bench:verify
 */
import "dotenv/config";

import puppeteer from "puppeteer";

import { BENCH_CONTEXT_ID, BENCH_SNAPSHOT_KEY, buildSnapshot } from "./fixture";

const base = `http://localhost:${process.env.PORT ?? 3001}`;
const token = process.env.BROWSER_SERVER_BYPASS_TOKEN ?? "";

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
  return JSON.parse(text) as { id: string; webSocketDebuggerUrl: string };
}

async function main() {
  const expected = buildSnapshot();
  const { id, webSocketDebuggerUrl } = await call("/browser/start", {
    headless: false,
    context: {
      id: BENCH_CONTEXT_ID,
      loadKey: BENCH_SNAPSHOT_KEY,
      persist: false,
    },
  });

  const failures: string[] = [];
  const browser = await puppeteer.connect({
    browserWSEndpoint: webSocketDebuggerUrl,
  });
  try {
    // Cookies, read browser-wide so httpOnly and Secure ones are included —
    // those are exactly the set a broken restore drops.
    const actualCookies = await browser.cookies();
    const seen = new Set(
      actualCookies.map((c) => `${c.domain}|${c.name}|${c.value}`),
    );
    const missingCookies = expected.cookies.filter(
      (c) => !seen.has(`${c.domain}|${c.name}|${c.value}`),
    );
    if (missingCookies.length) {
      failures.push(
        `${missingCookies.length}/${expected.cookies.length} cookies missing ` +
          `(e.g. ${missingCookies[0]?.domain} ${missingCookies[0]?.name})`,
      );
    }

    // localStorage, read from a fresh document on each origin.
    for (const origin of expected.origins) {
      const page = await browser.newPage();
      try {
        await page.setRequestInterception(true);
        page.on("request", (request) => {
          if (
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame()
          ) {
            void request
              .respond({ status: 200, contentType: "text/html", body: "" })
              .catch(() => {});
          } else {
            void request.abort().catch(() => {});
          }
        });
        await page.goto(origin.origin, { waitUntil: "domcontentloaded" });
        const actual = await page.evaluate(() => {
          const out: Record<string, string> = {};
          for (let i = 0; i < window.localStorage.length; i++) {
            const name = window.localStorage.key(i);
            if (name !== null) out[name] = window.localStorage.getItem(name) ?? "";
          }
          return out;
        });
        const missing = origin.localStorage.filter(
          (entry) => actual[entry.name] !== entry.value,
        );
        if (missing.length) {
          failures.push(
            `${origin.origin}: ${missing.length}/${origin.localStorage.length} localStorage keys wrong`,
          );
        }
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.disconnect();
    await call("/browser/stop", { id });
  }

  if (failures.length) {
    console.error("FAIL");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `PASS: ${expected.cookies.length} cookies and ` +
      `${expected.origins.length} origins restored intact`,
  );
}

void main();
