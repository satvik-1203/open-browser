import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BrowserServer, BrowserServerError } from "open-browser-sdk";
import puppeteer from "puppeteer";
import { startTestServer, type TestServer } from "./testServer";

const PORT = 3910;

let server: TestServer;
let client: BrowserServer;

before(async () => {
  server = await startTestServer(PORT);
  client = new BrowserServer({ hostUrl: server.baseUrl });
});

after(async () => {
  await server.stop();
});

/**
 * Poll `probe` until it reports 404, or give up and return the last status.
 *
 * `stop()` returns the moment teardown is *scheduled* — closing the browser,
 * finalizing a recording and dropping the session from the map all happen in
 * the background so the call doesn't block on an ffmpeg encode. So "the session
 * is gone" is an eventual state, not one that holds the instant stop() resolves.
 */
async function eventualStatus(
  probe: () => Promise<number>,
  { expected = 404, timeoutMs = 5_000 } = {},
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let status = await probe();
  while (status !== expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    status = await probe();
  }
  return status;
}

/** `eventualStatus` for an SDK call, which throws `BrowserServerError`. */
function statusOf(call: () => Promise<unknown>): () => Promise<number> {
  return () =>
    call()
      .then(() => 200)
      .catch((err: unknown) =>
        err instanceof BrowserServerError ? err.status : 0,
      );
}

test("start() launches a browser and returns routable devtools urls", async () => {
  const started = await client.start({
    headless: true,
    url: "https://example.com",
  });

  assert.match(started.id, /^[0-9a-f-]{36}$/);
  assert.equal(
    started.webSocketDebuggerUrl,
    `ws://localhost:${PORT}/devtools/browser/${started.id}`,
  );
  assert.match(
    started.debuggerUrl,
    new RegExp(
      `^http://localhost:${PORT}/browser/${started.id}/devtools/inspector\\.html\\?ws=`,
    ),
  );
  assert.equal(
    started.liveViewUrl,
    `http://localhost:${PORT}/browser/${started.id}/live`,
  );

  await client.stop(started.id);
});

test("liveViewUrl serves an embeddable page wired to the session's page target", async () => {
  const started = await client.start({ headless: true });
  const { targetId } = await client.get(started.id).then(async (info) => ({
    // The live view resolves the target itself, so assert against the same
    // target the inspector URL points at rather than trusting the page's own.
    targetId: new URL(info.debuggerUrl).searchParams.get("ws")!.split("/").pop(),
  }));

  const res = await fetch(started.liveViewUrl);
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/html/);
  // Framable by anyone — the whole point of this URL.
  assert.equal(res.headers.get("content-security-policy"), "frame-ancestors *");
  assert.equal(res.headers.get("x-frame-options"), null);
  // It must connect to *this* session's page target, and start a screencast
  // rather than load DevTools panels.
  assert.ok(html.includes(started.id));
  assert.ok(html.includes(targetId!));
  assert.ok(html.includes("Page.startScreencast"));
  assert.ok(html.includes("Input.dispatchMouseEvent"));

  // Read-only mode drops input forwarding but keeps the stream.
  const readOnly = await fetch(`${started.liveViewUrl}?interactive=false`).then(
    (r) => r.text(),
  );
  assert.ok(readOnly.includes('"interactive":false'));

  await client.stop(started.id);
});

test("liveViewUrl 404s once the session is gone", async () => {
  const started = await client.start({ headless: true });
  const url = started.liveViewUrl;
  await client.stop(started.id);

  assert.equal(await eventualStatus(() => fetch(url).then((r) => r.status)), 404);
});

test("get() reflects a running browser and mirrors start()'s urls", async () => {
  const started = await client.start({ headless: true });

  const got = await client.get(started.id);

  assert.equal(got.id, started.id);
  assert.equal(got.connected, true);
  assert.equal(got.webSocketDebuggerUrl, started.webSocketDebuggerUrl);
  assert.equal(got.debuggerUrl, started.debuggerUrl);
  assert.equal(got.liveViewUrl, started.liveViewUrl);

  await client.stop(started.id);
});

test("webSocketDebuggerUrl proxies real CDP traffic to the launched browser", async () => {
  const started = await client.start({
    headless: true,
    url: "https://example.com",
  });

  const connected = await puppeteer.connect({
    browserWSEndpoint: started.webSocketDebuggerUrl,
  });
  try {
    const pages = await connected.pages();
    assert.equal(pages.length, 1);
    assert.equal(pages[0]?.url(), "https://example.com/");
  } finally {
    await connected.disconnect();
  }

  await client.stop(started.id);
});

test("stop() shuts the browser down and a repeat stop() 404s", async () => {
  const started = await client.start({ headless: true });

  const stopped = await client.stop(started.id);
  assert.equal(stopped.id, started.id);

  assert.equal(await eventualStatus(statusOf(() => client.stop(started.id))), 404);
});

test("get() 404s once a browser has been stopped", async () => {
  const started = await client.start({ headless: true });
  await client.stop(started.id);

  assert.equal(await eventualStatus(statusOf(() => client.get(started.id))), 404);
});

test("each start() is an isolated profile — no cross-session cookie/localStorage leakage", async () => {
  const withData = await client.start({
    headless: true,
    url: "https://example.com",
    localstorage: { sandboxProbe: "leaked-if-shared" },
  });
  const fresh = await client.start({
    headless: true,
    url: "https://example.com",
  });

  const connected = await puppeteer.connect({
    browserWSEndpoint: fresh.webSocketDebuggerUrl,
  });
  try {
    const [page] = await connected.pages();
    assert.ok(page);
    const leaked = await page.evaluate(() =>
      window.localStorage.getItem("sandboxProbe"),
    );
    assert.equal(leaked, null);
  } finally {
    await connected.disconnect();
  }

  await client.stop(withData.id);
  await client.stop(fresh.id);
});

test("get() and stop() 404 for an id that never existed", async () => {
  const bogusId = "00000000-0000-0000-0000-000000000000";

  await assert.rejects(
    () => client.get(bogusId),
    (err: unknown) => err instanceof BrowserServerError && err.status === 404,
  );

  await assert.rejects(
    () => client.stop(bogusId),
    (err: unknown) => err instanceof BrowserServerError && err.status === 404,
  );
});
