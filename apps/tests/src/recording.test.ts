import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { BrowserServer } from "open-browser-sdk";
import puppeteer from "puppeteer";
import { startTestServer } from "./testServer";

// Load apps/tests/.env into process.env if present (the shell may also provide these).
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch {
  // No .env file — rely on the ambient environment.
}

const PORT = 3911;

// Standard AWS names, with the shorter AWS_ACCESS_KEY/AWS_SECRET_KEY as fallbacks.
const region = process.env.AWS_REGION;
const bucket = process.env.AWS_S3_BUCKET;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY;
const secretAccessKey =
  process.env.AWS_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_KEY;

const aws =
  region && bucket && accessKeyId && secretAccessKey
    ? { region, bucket, accessKeyId, secretAccessKey }
    : undefined;

const skip = aws
  ? false
  : "set AWS_REGION/AWS_S3_BUCKET/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY to run";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Storage lives on the server now: the spawned test server inherits the AWS_*
// vars loaded above (see testServer.ts) and configures its adapter from them.
// The client just asks to record.
function newClient(hostUrl: string): BrowserServer {
  return new BrowserServer({ hostUrl });
}

async function headObject(key: string) {
  const s3 = new S3Client({
    region: aws!.region,
    credentials: {
      accessKeyId: aws!.accessKeyId,
      secretAccessKey: aws!.secretAccessKey,
    },
  });
  return s3.send(new HeadObjectCommand({ Bucket: aws!.bucket, Key: key }));
}

test("records the tab, encodes an mp4, and stores it in S3", { skip }, async () => {
  const server = await startTestServer(PORT);
  try {
    const client = newClient(server.baseUrl);

    const started = await client.start({
      headless: true,
      url: "https://example.com",
      record: true,
    });

    // Drive some repaints so the activity-driven capture yields several frames.
    const connected = await puppeteer.connect({
      browserWSEndpoint: started.webSocketDebuggerUrl,
    });
    try {
      const [page] = await connected.pages();
      assert.ok(page);
      for (let i = 0; i < 5; i++) {
        await page.evaluate((n: number) => {
          document.body.style.background = n % 2 ? "#000" : "#fff";
        }, i);
        await sleep(300);
      }
    } finally {
      await connected.disconnect();
    }

    const stopped = await client.stop(started.id);
    assert.equal(stopped.recording?.status, "completed");
    assert.ok(stopped.recording?.key, "expected a recording key");
    assert.ok(stopped.recording?.url, "expected a recording url");

    // The object should exist and look like a non-empty mp4.
    const head = await headObject(stopped.recording.key);
    assert.ok((head.ContentLength ?? 0) > 0, "recording should not be empty");
    assert.equal(head.ContentType, "video/mp4");
  } finally {
    await server.stop();
  }
});

test(
  "records a multi-step session (Hacker News → Google → search 'dogs')",
  { skip },
  async () => {
    const server = await startTestServer(PORT + 1);
    try {
      const client = newClient(server.baseUrl);

      const started = await client.start({
        headless: true,
        viewport: { width: 1280, height: 720 },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        record: true,
      });

      // Drive real actions through the proxied DevTools endpoint. The server is
      // recording the same tab, so every navigation/keystroke is captured.
      const connected = await puppeteer.connect({
        browserWSEndpoint: started.webSocketDebuggerUrl,
      });
      try {
        const [page] = await connected.pages();
        assert.ok(page);

        // 1) Hacker News
        await page.goto("https://news.ycombinator.com/", {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        assert.match(await page.title(), /Hacker News/i);
        await sleep(1500);

        // 2) Google
        await page.goto("https://www.google.com/", {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        // Best-effort: dismiss the EU consent interstitial if it shows.
        await page.click("#L2AGLb").catch(() => {});
        await sleep(1000);

        // 3) Type "dogs" into the search box and submit.
        const box = await page.waitForSelector(
          'textarea[name="q"], input[name="q"]',
          { timeout: 15_000 },
        );
        assert.ok(box, "expected a Google search box");
        await box.type("dogs", { delay: 80 });
        await sleep(500);
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20_000 }),
          page.keyboard.press("Enter"),
        ]).catch(() => {});
        await sleep(1500);

        // The "dogs" query was submitted. Headless Chrome from a datacenter IP
        // often lands on Google's bot-check page instead of results — either way
        // the query is in the URL, proving the typed search action executed.
        assert.match(decodeURIComponent(page.url()), /dogs/);
        await sleep(1500);
      } finally {
        await connected.disconnect();
      }

      const stopped = await client.stop(started.id);
      assert.equal(stopped.recording?.status, "completed");
      assert.ok(stopped.recording?.key, "expected a recording key");

      const head = await headObject(stopped.recording.key);
      assert.ok((head.ContentLength ?? 0) > 0, "recording should not be empty");
      assert.equal(head.ContentType, "video/mp4");

      // Surface the replay location in the test output.
      console.log(`\n▶ multi-step replay stored: ${stopped.recording.url}\n`);
    } finally {
      await server.stop();
    }
  },
);
