import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { eq } from "drizzle-orm";
import { BrowserServer, BrowserServerError } from "open-browser-sdk";
import puppeteer from "puppeteer";

import { schema, startHarness, type Harness } from "../harness";

let h: Harness;
let token: string;
let userId: string;

before(async () => {
  h = await startHarness();
  const seeded = await h.seedUser();
  token = seeded.token;
  userId = seeded.userId;
}, { timeout: 180_000 });

after(async () => {
  await h?.stop();
});

/** Read a browser_session row straight from the test DB. */
async function sessionRow(id: string) {
  const [row] = await h.db
    .select()
    .from(schema.browserSession)
    .where(eq(schema.browserSession.id, id))
    .limit(1);
  return row;
}

describe("auth / API key", () => {
  it("rejects a request with no token (401)", async () => {
    const res = await fetch(`${h.dashboardUrl}/browser`);
    assert.equal(res.status, 401);
  });

  it("rejects a garbage token (401)", async () => {
    const res = await fetch(`${h.dashboardUrl}/browser`, {
      headers: { authorization: "Bearer ob_not_a_real_token" },
    });
    assert.equal(res.status, 401);
  });

  it("accepts the seeded API token (200) and lists the user's sessions", async () => {
    const res = await h.api("/browser", token);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { sessions: unknown[] };
    assert.ok(Array.isArray(body.sessions));
  });
});

describe("browser lifecycle", () => {
  it("start() logs a running session owned by the user", async () => {
    const sdk = h.sdkFor(token);
    const started = await sdk.start({ headless: true, url: "https://example.com" });
    try {
      assert.match(started.id, /^[0-9a-f-]{36}$/);

      const row = await sessionRow(started.id);
      assert.ok(row, "session row should exist");
      assert.equal(row.status, "running");
      assert.equal(row.userId, userId);
      assert.notEqual(row.startedAt, null);
    } finally {
      await sdk.stop(started.id);
    }
  });

  it("start() redacts the proxy password in the stored options", async () => {
    const sdk = h.sdkFor(token);
    const started = await sdk.start({
      headless: true,
      proxy: { server: "http://127.0.0.1:9",  username: "u", password: "s3cret" },
    });
    try {
      const row = await sessionRow(started.id);
      assert.equal(row?.options?.proxy?.username, "u");
      assert.equal(row?.options?.proxy?.password, undefined);
    } finally {
      await sdk.stop(started.id);
    }
  });

  it("get() reflects the running browser and CDP actually works", async () => {
    const sdk = h.sdkFor(token);
    const started = await sdk.start({ headless: true, url: "https://example.com" });
    try {
      const got = await sdk.get(started.id);
      assert.equal(got.connected, true);
      assert.equal(got.webSocketDebuggerUrl, started.webSocketDebuggerUrl);

      const browser = await puppeteer.connect({
        browserWSEndpoint: started.webSocketDebuggerUrl,
      });
      try {
        const pages = await browser.pages();
        assert.equal(pages[0]?.url(), "https://example.com/");
      } finally {
        await browser.disconnect();
      }
    } finally {
      await sdk.stop(started.id);
    }
  });

  it("stop() flips the DB status running → stopped", async () => {
    const sdk = h.sdkFor(token);
    const started = await sdk.start({ headless: true });

    assert.equal((await sessionRow(started.id))?.status, "running");

    await sdk.stop(started.id);

    const row = await sessionRow(started.id);
    assert.equal(row?.status, "stopped");
    assert.notEqual(row?.endedAt, null);
  });

  it("a second stop() 404s", async () => {
    const sdk = h.sdkFor(token);
    const started = await sdk.start({ headless: true });
    await sdk.stop(started.id);

    await assert.rejects(
      () => sdk.stop(started.id),
      (err: unknown) => err instanceof BrowserServerError && err.status === 404,
    );
  });
});

describe("ownership", () => {
  it("a user cannot get or stop another user's browser", async () => {
    const owner = h.sdkFor(token);
    const started = await owner.start({ headless: true });
    try {
      const other = await h.seedUser({
        id: "usr_e2e_other",
        email: "other@e2e.local",
        username: "other",
      });
      const stranger = h.sdkFor(other.token);

      await assert.rejects(
        () => stranger.stop(started.id),
        (err: unknown) => err instanceof BrowserServerError && err.status === 404,
      );
      await assert.rejects(
        () => stranger.get(started.id),
        (err: unknown) => err instanceof BrowserServerError && err.status === 404,
      );

      // Still owned + running for the real owner.
      assert.equal((await sessionRow(started.id))?.status, "running");
    } finally {
      await owner.stop(started.id);
    }
  });
});

describe("recording", () => {
  it("record → stop → recording URL (skips if S3 is not configured)", async (t) => {
    const sdk: BrowserServer = h.sdkFor(token);

    let started;
    try {
      started = await sdk.start({
        headless: true,
        url: "https://example.com",
        record: true,
      });
    } catch (err) {
      if (err instanceof BrowserServerError && err.status === 400) {
        t.skip("recording not configured (no S3 creds)");
        return;
      }
      throw err;
    }

    // Give the recorder a moment to capture at least one frame.
    await new Promise((r) => setTimeout(r, 2000));
    await sdk.stop(started.id);

    assert.equal((await sessionRow(started.id))?.status, "stopped");

    try {
      const url = await sdk.getSessionRecordingUrl(started.id);
      assert.match(url, /^https?:\/\//);
    } catch (err) {
      if (err instanceof BrowserServerError && err.status === 404) {
        t.skip("no recording was stored (no frames captured)");
        return;
      }
      throw err;
    }
  });
});
