import { createInterface } from "node:readline";
import { logger } from "@repo/logger";
import type { RecordingEventKind } from "@repo/types";
import type { Request, Response } from "express";
import { recordingEventsStream } from "@/services/browser/recordingEvents";

const KINDS: RecordingEventKind[] = [
  "network",
  "console",
  "action",
  "navigation",
];

/** Parse a `?kind=network,console` filter into a set, ignoring unknown kinds. */
function parseKinds(raw: unknown): Set<RecordingEventKind> | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  const wanted = raw
    .split(",")
    .map((k) => k.trim())
    .filter((k): k is RecordingEventKind =>
      KINDS.includes(k as RecordingEventKind),
    );
  return wanted.length ? new Set(wanted) : undefined;
}

/**
 * Stream a session's `events.ndjson` to the client as newline-delimited JSON.
 * When `?kind=` is given, filter line by line as bytes pass through — the whole
 * object is never buffered into the heap, so a busy session stays cheap to
 * serve. The heavy response bodies live in separate objects (getRecordingBody).
 */
export async function getRecordingEvents(req: Request, res: Response) {
  const { id } = req.params;
  if (typeof id !== "string") {
    res.status(404).json({ error: "recording not found" });
    return;
  }

  try {
    const stream = await recordingEventsStream(id);
    if (!stream) {
      res.status(404).json({ error: "recording events not found" });
      return;
    }

    res.setHeader("content-type", "application/x-ndjson");
    const kinds = parseKinds(req.query.kind);

    if (!kinds) {
      // No filter — pipe the object straight through, no per-line work.
      stream.on("error", () => res.destroy());
      stream.pipe(res);
      return;
    }

    // Filter line by line. `kind` sits near the front of each row, so a cheap
    // substring pre-check avoids parsing rows that can't match.
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line) return;
      for (const kind of kinds) {
        if (line.includes(`"kind":"${kind}"`)) {
          res.write(`${line}\n`);
          return;
        }
      }
    });
    rl.on("close", () => res.end());
    rl.on("error", () => res.destroy());
    stream.on("error", () => res.destroy());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("recording events lookup failed", { id, error: message });
    if (!res.headersSent) {
      res.status(500).json({ error: "failed to look up recording events" });
    } else {
      res.destroy();
    }
  }
}
