import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BrowserServer, BrowserServerError } from "open-browser-sdk";
import { startTestServer, type TestServer } from "./testServer";

const PORT = 3911;

let server: TestServer;
let client: BrowserServer;

before(async () => {
  server = await startTestServer(PORT);
  client = new BrowserServer({ hostUrl: server.baseUrl });
});

after(async () => {
  await server.stop();
});

test("getServerMetrics() reports host cpu and memory utilization", async () => {
  const { server: metrics } = await client.getServerMetrics();

  assert.ok(metrics.cpu.cores >= 1);
  assert.equal(metrics.cpu.loadAverage.length, 3);
  assert.ok(metrics.cpu.usagePercent >= 0);
  assert.ok(metrics.memory.totalBytes > 0);
  assert.equal(
    metrics.memory.usedBytes,
    metrics.memory.totalBytes - metrics.memory.freeBytes,
  );
  assert.ok(metrics.memory.usagePercent >= 0 && metrics.memory.usagePercent <= 100);
  assert.ok(metrics.uptimeSeconds >= 0);
});

test("getBrowserMetrics() lists active browsers with cpu and memory usage", async () => {
  const started = await client.start({ headless: true });

  try {
    const page = await client.getBrowserMetrics();

    assert.equal(page.page, 1);
    assert.equal(page.pageSize, 20);
    assert.equal(page.sortBy, "cpu");
    assert.equal(page.order, "desc");
    assert.ok(page.total >= 1);

    const entry = page.items.find((item) => item.id === started.id);
    assert.ok(entry, "started browser should appear in metrics");
    assert.equal(entry.connected, true);
    assert.equal(typeof entry.pid, "number");
    assert.ok(entry.createdAt > 0);
    assert.ok(entry.memoryBytes > 0);
    assert.ok(entry.cpuPercent >= 0);
  } finally {
    await client.stop(started.id);
  }
});

test("getBrowserMetrics() paginates and honors sort order", async () => {
  const ids = await Promise.all([
    client.start({ headless: true }),
    client.start({ headless: true }),
    client.start({ headless: true }),
  ]).then((results) => results.map((r) => r.id));

  try {
    const firstPage = await client.getBrowserMetrics({
      page: 1,
      pageSize: 2,
      sortBy: "memory",
      order: "desc",
    });

    assert.equal(firstPage.pageSize, 2);
    assert.ok(firstPage.items.length <= 2);
    assert.ok(firstPage.total >= 3);
    assert.ok(firstPage.totalPages >= 2);

    // Descending memory: each entry is >= the next.
    for (let i = 1; i < firstPage.items.length; i++) {
      assert.ok(firstPage.items[i - 1]!.memoryBytes >= firstPage.items[i]!.memoryBytes);
    }

    const secondPage = await client.getBrowserMetrics({
      page: 2,
      pageSize: 2,
      sortBy: "memory",
      order: "desc",
    });
    assert.equal(secondPage.page, 2);

    const firstIds = new Set(firstPage.items.map((item) => item.id));
    for (const item of secondPage.items) {
      assert.ok(!firstIds.has(item.id), "pages should not overlap");
    }
  } finally {
    await Promise.all(ids.map((id) => client.stop(id)));
  }
});

test("getBrowserMetrics() rejects an invalid sortBy with 400", async () => {
  await assert.rejects(
    () =>
      client.getBrowserMetrics({
        sortBy: "disk" as never,
      }),
    (err: unknown) => err instanceof BrowserServerError && err.status === 400,
  );
});
