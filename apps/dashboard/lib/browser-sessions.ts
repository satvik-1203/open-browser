import { db, schema } from "@repo/db";
import type {
  BrowserSessionRecord,
  RecordingStatus,
  StartBrowserOptions,
} from "@repo/types";
import { and, desc, eq } from "drizzle-orm";

type BrowserSessionRow = typeof schema.browserSession.$inferSelect;

/** Strip secrets (proxy password) before persisting the start options. */
export function redactOptions(
  options: StartBrowserOptions,
): StartBrowserOptions {
  if (!options.proxy?.password) return options;
  return { ...options, proxy: { ...options.proxy, password: undefined } };
}

/** Load a session only if it belongs to the given user (else undefined). */
export async function findOwnedSession(
  id: string,
  userId: string,
): Promise<BrowserSessionRow | undefined> {
  const [row] = await db
    .select()
    .from(schema.browserSession)
    .where(
      and(
        eq(schema.browserSession.id, id),
        eq(schema.browserSession.userId, userId),
      ),
    )
    .limit(1);
  return row;
}

/** A user's sessions, most recent first. */
export async function listSessions(
  userId: string,
): Promise<BrowserSessionRow[]> {
  return db
    .select()
    .from(schema.browserSession)
    .where(eq(schema.browserSession.userId, userId))
    .orderBy(desc(schema.browserSession.createdAt));
}

/** Settle a session row that failed to start. */
export async function markStartFailed(
  id: string,
  message?: string,
): Promise<void> {
  await db
    .update(schema.browserSession)
    .set({
      status: "failed",
      errorMessage: message ?? null,
      // The browser never launched, so nothing was ever recorded.
      recordingStatus: "none",
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.browserSession.id, id));
}

/** Serialize a row into the user-facing API shape. */
export function toRecord(row: BrowserSessionRow): BrowserSessionRecord {
  return {
    id: row.id,
    status: row.status,
    recordingStatus: (row.recordingStatus as RecordingStatus | null) ?? null,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}
