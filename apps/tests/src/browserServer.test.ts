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

  await client.stop(started.id);
});

test("get() reflects a running browser and mirrors start()'s urls", async () => {
  const started = await client.start({ headless: true });

  const got = await client.get(started.id);

  assert.equal(got.id, started.id);
  assert.equal(got.connected, true);
  assert.equal(got.webSocketDebuggerUrl, started.webSocketDebuggerUrl);
  assert.equal(got.debuggerUrl, started.debuggerUrl);

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

  await assert.rejects(
    () => client.stop(started.id),
    (err: unknown) => err instanceof BrowserServerError && err.status === 404,
  );
});

test("get() 404s once a browser has been stopped", async () => {
  const started = await client.start({ headless: true });
  await client.stop(started.id);

  await assert.rejects(
    () => client.get(started.id),
    (err: unknown) => err instanceof BrowserServerError && err.status === 404,
  );
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
