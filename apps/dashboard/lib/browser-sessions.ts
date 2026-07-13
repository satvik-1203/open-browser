import { db, schema } from "@repo/db";
import type {
  BrowserSessionRecord,
  RecordingStatus,
  StartBrowserOptions,
} from "@repo/types";
import { and, count, desc, eq, isNotNull, lt, ne, or } from "drizzle-orm";

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

export interface SessionsPage {
  rows: BrowserSessionRow[];
  nextCursor: string | null;
  /** Total matching rows (ignores the cursor) — for "Page X of Y". */
  total: number;
}

// Cursor = base64url(`<createdAt ISO>|<id>`). Ordering is (createdAt, id) DESC,
// so id is a stable tiebreak for rows sharing a createdAt.
function encodeCursor(row: BrowserSessionRow): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString(
    "base64url",
  );
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const [ts, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!ts || !id) return null;
    const createdAt = new Date(ts);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * One page of a user's sessions, keyset-paginated by (createdAt, id) DESC.
 * `recorded` restricts to sessions that have (or are producing) a recording.
 * Returns up to `limit` rows plus the cursor for the next page (null at the end).
 */
export async function listSessionsPage(params: {
  userId: string;
  limit: number;
  recorded?: boolean;
  cursor?: string | null;
}): Promise<SessionsPage> {
  const { userId, limit, recorded, cursor } = params;
  const decoded = cursor ? decodeCursor(cursor) : null;

  // The filter every page shares (used for the total count).
  const baseFilter = and(
    eq(schema.browserSession.userId, userId),
    recorded ? isNotNull(schema.browserSession.recordingStatus) : undefined,
    recorded ? ne(schema.browserSession.recordingStatus, "none") : undefined,
  );

  // The page also excludes everything at/after the cursor.
  const where = decoded
    ? and(
        baseFilter,
        or(
          lt(schema.browserSession.createdAt, decoded.createdAt),
          and(
            eq(schema.browserSession.createdAt, decoded.createdAt),
            lt(schema.browserSession.id, decoded.id),
          ),
        ),
      )
    : baseFilter;

  const [rows, totalRows] = await Promise.all([
    // Fetch one extra row to detect whether another page exists.
    db
      .select()
      .from(schema.browserSession)
      .where(where)
      .orderBy(
        desc(schema.browserSession.createdAt),
        desc(schema.browserSession.id),
      )
      .limit(limit + 1),
    db
      .select({ value: count() })
      .from(schema.browserSession)
      .where(baseFilter),
  ]);

  const total = totalRows[0]?.value ?? 0;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    rows: page,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
    total,
  };
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
