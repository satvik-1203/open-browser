import { createInterface } from "node:readline";
import { createReadStream, createWriteStream } from "node:fs";
import { join } from "node:path";
import type {
  ConsoleRecordingEvent,
  NetworkRecordingEvent,
  RecordingEvent,
} from "@repo/types";
import type { Capture } from "@/services/recording/types";
import { summarizeAction } from "@/services/recording/actions";

/** One captured response body, written to disk and destined for storage. */
export interface BodyArtifact {
  requestId: string;
  /** Local file path holding the (already decoded) body bytes. */
  file: string;
  /** Storage key the body will be uploaded under. */
  key: string;
}

export interface BuildEventsResult {
  /** Local path to the produced `events.ndjson`. */
  eventsFile: string;
  bodies: BodyArtifact[];
}

/** A raw capture log line: `{ ts, method, params }`. */
interface RawLine {
  ts: number;
  method: string;
  params?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}
function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function num(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** Flatten CDP console `args` (RemoteObjects) into a readable line. */
function consoleText(args: unknown): string {
  if (!Array.isArray(args)) return "";
  return args
    .map((arg) => {
      const a = asRecord(arg);
      if (a.value !== undefined) return String(a.value);
      return str(a.description) ?? str(a.unserializableValue) ?? str(a.type) ?? "";
    })
    .join(" ")
    .trim();
}

/**
 * Stream one target's raw CDP log line by line, folding each event into the
 * accumulating network-row map (`net`) or pushing a console/navigation row onto
 * `events`. Response bodies are decoded and written to their own files (tracked
 * in `bodies`) rather than kept in `events` — nothing large stays in the heap.
 */
async function foldTargetLog(
  file: string,
  targetId: string,
  ctx: {
    dir: string;
    events: RecordingEvent[];
    net: Map<string, NetworkRecordingEvent>;
    bodies: BodyArtifact[];
    bodyKey: (requestId: string) => string;
  },
): Promise<void> {
  const rl = createInterface({
    input: createReadStream(file),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line) continue;
    let entry: RawLine;
    try {
      entry = JSON.parse(line) as RawLine;
    } catch {
      continue; // a torn final line from a crash — skip it
    }
    const { ts, method } = entry;
    const p = asRecord(entry.params);

    switch (method) {
      case "Network.requestWillBeSent": {
        const requestId = str(p.requestId);
        const request = asRecord(p.request);
        const url = str(request.url);
        if (!requestId || !url) break;
        ctx.net.set(requestId, {
          ts,
          kind: "network",
          targetId,
          requestId,
          requestMethod: str(request.method) ?? "GET",
          url,
          resourceType: str(p.type),
        });
        break;
      }
      case "Network.responseReceived": {
        const row = ctx.net.get(str(p.requestId) ?? "");
        if (!row) break;
        const response = asRecord(p.response);
        row.status = num(response.status);
        row.statusText = str(response.statusText);
        row.mimeType = str(response.mimeType);
        break;
      }
      case "Network.loadingFinished": {
        const row = ctx.net.get(str(p.requestId) ?? "");
        if (!row) break;
        row.encodedDataLength = num(p.encodedDataLength);
        row.durationMs = ts - row.ts;
        break;
      }
      case "Network.loadingFailed": {
        const row = ctx.net.get(str(p.requestId) ?? "");
        if (!row) break;
        row.failed = true;
        row.errorText = str(p.errorText);
        row.durationMs = ts - row.ts;
        break;
      }
      case "Network.responseBody": {
        const requestId = str(p.requestId);
        const row = requestId ? ctx.net.get(requestId) : undefined;
        if (!requestId || !row) break;
        if (p.skipped) {
          row.bodySize = num(p.size);
          break;
        }
        const body = str(p.body);
        if (body === undefined) break;
        const buf = p.base64Encoded
          ? Buffer.from(body, "base64")
          : Buffer.from(body, "utf8");
        const bodyFile = join(ctx.dir, `body-${requestId}`);
        await new Promise<void>((resolve, reject) => {
          const ws = createWriteStream(bodyFile);
          ws.on("error", reject);
          ws.on("finish", resolve);
          ws.end(buf);
        });
        row.bodySize = buf.byteLength;
        row.bodyKey = ctx.bodyKey(requestId);
        ctx.bodies.push({ requestId, file: bodyFile, key: row.bodyKey });
        break;
      }
      case "Runtime.consoleAPICalled": {
        ctx.events.push(consoleEvent(ts, targetId, str(p.type) ?? "log", consoleText(p.args), "console"));
        break;
      }
      case "Runtime.exceptionThrown": {
        const details = asRecord(p.exceptionDetails);
        const exception = asRecord(details.exception);
        const text =
          str(exception.description) ?? str(details.text) ?? "Uncaught exception";
        ctx.events.push(consoleEvent(ts, targetId, "error", text, "exception"));
        break;
      }
      case "Log.entryAdded": {
        const en = asRecord(p.entry);
        ctx.events.push({
          ...consoleEvent(ts, targetId, str(en.level) ?? "log", str(en.text) ?? "", "log-entry"),
          url: str(en.url),
          lineNumber: num(en.lineNumber),
        });
        break;
      }
      case "Page.frameNavigated": {
        const frame = asRecord(p.frame);
        ctx.events.push({
          ts,
          kind: "navigation",
          targetId,
          event: "frameNavigated",
          url: str(frame.url),
        });
        break;
      }
      case "Page.loadEventFired": {
        ctx.events.push({ ts, kind: "navigation", targetId, event: "loadEventFired" });
        break;
      }
      default:
        break;
    }
  }
}

function consoleEvent(
  ts: number,
  targetId: string,
  level: string,
  text: string,
  source: ConsoleRecordingEvent["source"],
): ConsoleRecordingEvent {
  return { ts, kind: "console", targetId, level, text, source };
}

/** Fold the actions log (`{ ts, method, params }`) into action events. */
async function foldActionsLog(
  file: string,
  events: RecordingEvent[],
): Promise<void> {
  const rl = createInterface({
    input: createReadStream(file),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line) continue;
    let entry: RawLine;
    try {
      entry = JSON.parse(line) as RawLine;
    } catch {
      continue;
    }
    const { name, detail } = summarizeAction(entry.method, entry.params);
    events.push({
      ts: entry.ts,
      kind: "action",
      targetId: "client",
      name,
      method: entry.method,
      detail,
    });
  }
}

/**
 * Transform a raw capture into the read-optimized `events.ndjson` (network rows
 * correlated across their CDP lifecycle, plus console/action/navigation rows,
 * sorted by time) and a set of split-out response-body files. All reads stream
 * from the local capture files — bodies never re-enter the heap beyond the one
 * being written — so this stays cheap even for a busy session.
 */
export async function buildEvents(
  capture: Capture,
  bodyKey: (requestId: string) => string,
): Promise<BuildEventsResult> {
  const events: RecordingEvent[] = [];
  const net = new Map<string, NetworkRecordingEvent>();
  const bodies: BodyArtifact[] = [];
  const ctx = { dir: capture.dir, events, net, bodies, bodyKey };

  for (const log of capture.logs) {
    await foldTargetLog(log.file, log.targetId, ctx);
  }
  if (capture.actionsLog) await foldActionsLog(capture.actionsLog, events);

  // Emit the collapsed network rows alongside the streamed console/nav/action
  // rows, then order the whole timeline by event time.
  events.push(...net.values());
  events.sort((a, b) => a.ts - b.ts);

  const eventsFile = join(capture.dir, "events.ndjson");
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(eventsFile);
    ws.on("error", reject);
    ws.on("finish", resolve);
    for (const event of events) ws.write(`${JSON.stringify(event)}\n`);
    ws.end();
  });

  return { eventsFile, bodies };
}
