import { db, schema } from "@repo/db";
import { logger } from "@repo/logger";
import type {
  BrowserContextRecord,
  ContextSaveResult,
  ProxyOptions,
  ResolvedContext,
} from "@repo/types";
import { and, eq, desc, inArray, sql } from "drizzle-orm";

type BrowserContextRow = typeof schema.browserContext.$inferSelect;

/** Statuses that mean a session is still live and may still write back. */
const ACTIVE_STATUSES = ["starting", "running", "stopping"] as const;

/** Storage key for a given version of a context's profile archive. */
export function snapshotKey(contextId: string, version: number): string {
  return `contexts/${contextId}/${version}.tar.gz`;
}

/** Load a context only if it belongs to the given user (else undefined). */
export async function findOwnedContext(
  id: string,
  userId: string,
): Promise<BrowserContextRow | undefined> {
  const [row] = await db
    .select()
    .from(schema.browserContext)
    .where(
      and(
        eq(schema.browserContext.id, id),
        eq(schema.browserContext.userId, userId),
      ),
    )
    .limit(1);
  return row;
}

/** A user's contexts, newest first. */
export async function listContexts(
  userId: string,
): Promise<BrowserContextRow[]> {
  return db
    .select()
    .from(schema.browserContext)
    .where(eq(schema.browserContext.userId, userId))
    .orderBy(desc(schema.browserContext.createdAt));
}

/**
 * How many live sessions are set to write back to each of the given contexts.
 *
 * Derived from the session log rather than tracked on the context row. A
 * counter would have to be decremented by the session-ended callback, which a
 * crashed browser server never sends — it would drift upward forever and there
 * would be no way to tell a real writer from a leaked one.
 */
export async function countWriters(
  contextIds: string[],
): Promise<Map<string, number>> {
  if (contextIds.length === 0) return new Map();
  const rows = await db
    .select({
      contextId: schema.browserSession.contextId,
      value: sql<number>`count(*)::int`,
    })
    .from(schema.browserSession)
    .where(
      and(
        inArray(schema.browserSession.contextId, contextIds),
        eq(schema.browserSession.contextPersist, "write"),
        inArray(schema.browserSession.status, [...ACTIVE_STATUSES]),
      ),
    )
    .groupBy(schema.browserSession.contextId);

  return new Map(
    rows.flatMap((row) => (row.contextId ? [[row.contextId, row.value]] : [])),
  );
}

/**
 * Resolve a context for a starting session.
 *
 * Nothing is locked and nothing can be refused: any number of sessions may run
 * against a context, each on its own copy of the profile. They no longer merge,
 * though — a Chromium profile cannot be merged the way cookies could — so the
 * last session to end wins the write-back. `countWriters` is what surfaces that
 * to the caller. The write key isn't chosen here; it's picked at save time
 * against whatever version is current by then.
 */
export function acquireContext(
  row: BrowserContextRow,
  persist: boolean,
): ResolvedContext {
  return {
    id: row.id,
    loadKey: row.snapshotKey ?? undefined,
    persist,
  };
}

/** Where a writer should merge from: the current version and its key. */
export async function readSlot(
  contextId: string,
): Promise<{ version: number; snapshotKey: string | null } | undefined> {
  const [row] = await db
    .select({
      version: schema.browserContext.version,
      snapshotKey: schema.browserContext.snapshotKey,
    })
    .from(schema.browserContext)
    .where(eq(schema.browserContext.id, contextId))
    .limit(1);
  return row;
}

export interface CommitResult {
  ok: boolean;
  /** The context's version after the attempt — the one to retry against. */
  version: number;
}

/**
 * Promote a freshly written snapshot to be the context's current version, but
 * only if nothing else moved it in the meantime.
 *
 * This is the concurrency control that replaced the lease. The writer merged
 * its delta onto `fromVersion`; if another session committed since, that merge
 * was against stale data and the `where version = fromVersion` clause matches
 * nothing. The caller re-reads and merges again — its delta is still valid,
 * only the base moved.
 */
export async function commitSnapshot(params: {
  contextId: string;
  fromVersion: number;
  key: string;
  sizeBytes: number;
}): Promise<CommitResult> {
  const { contextId, fromVersion, key, sizeBytes } = params;
  const now = new Date();

  const [row] = await db
    .update(schema.browserContext)
    .set({
      status: "ready",
      snapshotKey: key,
      version: fromVersion + 1,
      sizeBytes,
      errorMessage: null,
      lastUsedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.browserContext.id, contextId),
        eq(schema.browserContext.version, fromVersion),
      ),
    )
    .returning({ version: schema.browserContext.version });

  if (row) return { ok: true, version: row.version };

  // Lost the race. Report where the context actually is so the writer can
  // re-merge against it.
  const slot = await readSlot(contextId);
  return { ok: false, version: slot?.version ?? fromVersion };
}

/**
 * Record a failed write-back. The context keeps its current version and stays
 * loadable — a failed save degrades a profile to "stale", never to "broken".
 */
export async function markSaveFailed(
  contextId: string,
  message: string,
): Promise<void> {
  await db
    .update(schema.browserContext)
    .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
    .where(eq(schema.browserContext.id, contextId));
}

/** Apply the outcome reported on the session-ended callback. */
export async function settleContext(
  sessionId: string,
  result: ContextSaveResult,
): Promise<void> {
  if (!result.saved) {
    await markSaveFailed(result.id, result.error ?? "context save failed");
  }
  logger.info("context settled", {
    contextId: result.id,
    sessionId,
    saved: result.saved,
    sizeBytes: result.sizeBytes,
  });
}

/** Strip the proxy password before persisting, as `browser_session` does. */
export function redactProxy(proxy?: ProxyOptions): ProxyOptions | undefined {
  if (!proxy?.password) return proxy;
  return { ...proxy, password: undefined };
}

/** Serialize a row into the user-facing API shape. */
export function toContextRecord(
  row: BrowserContextRow,
  writers = 0,
): BrowserContextRecord {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    version: row.version,
    sizeBytes: row.sizeBytes,
    writers,
    fingerprint: row.fingerprint,
    errorMessage: row.errorMessage,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
