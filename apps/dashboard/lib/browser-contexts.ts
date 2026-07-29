import { db, schema } from "@repo/db";
import { logger } from "@repo/logger";
import type {
  BrowserContextRecord,
  ContextSaveResult,
  ProxyOptions,
  ResolvedContext,
} from "@repo/types";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

type BrowserContextRow = typeof schema.browserContext.$inferSelect;

/**
 * How long a write lease stays valid without being released.
 *
 * The lease is normally released by the session-ended callback, but a browser
 * server that crashes or is killed never sends one — without an expiry the
 * context would be permanently unwritable. Set well above a realistic session
 * length: expiring early is worse than expiring late, since it would let two
 * sessions believe they can both save and quietly lose one of their updates.
 */
const LEASE_TTL_MS = 6 * 60 * 60 * 1000;

/** Storage key for a given version of a context's snapshot. */
export function snapshotKey(contextId: string, version: number): string {
  return `contexts/${contextId}/${version}.json.gz`;
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

/** A user's contexts, most recently used first. */
export async function listContexts(
  userId: string,
): Promise<BrowserContextRow[]> {
  return db
    .select()
    .from(schema.browserContext)
    .where(eq(schema.browserContext.userId, userId))
    .orderBy(desc(schema.browserContext.createdAt));
}

export class ContextInUseError extends Error {}

/**
 * Resolve a context for a starting session.
 *
 * Read-only (`persist: false`, the default) hands back only the current
 * snapshot key: the session forks the profile, never writes back, and any
 * number of them can run against one context at once.
 *
 * Write (`persist: true`) additionally takes the single-writer lease. The
 * conditional UPDATE is the whole concurrency control — the `where` clause only
 * matches when the lease is free or expired, so two simultaneous starts race in
 * the database and exactly one comes back with a row. Checking first and then
 * updating would leave a window where both saw it free.
 *
 * One writer is the rule everywhere (Browserbase warns outright that two
 * sessions on one context will get you logged out) and the reason is the sites,
 * not the storage: a provider that sees one account driving two browsers with
 * the same cookies treats it as theft and invalidates the session.
 */
export async function acquireContext(
  row: BrowserContextRow,
  sessionId: string,
  persist: boolean,
): Promise<ResolvedContext> {
  const loadKey = row.snapshotKey ?? undefined;
  if (!persist) return { id: row.id, loadKey };

  const now = new Date();
  // Always a fresh key, never the one we're reading from. A save that fails
  // partway then leaves the previous version untouched and still loadable,
  // which is what keeps a bad save from destroying a working profile.
  const saveKey = snapshotKey(row.id, row.version + 1);

  const [claimed] = await db
    .update(schema.browserContext)
    .set({
      leaseSessionId: sessionId,
      leaseExpiresAt: new Date(now.getTime() + LEASE_TTL_MS),
      leaseSaveKey: saveKey,
      lastUsedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.browserContext.id, row.id),
        or(
          isNull(schema.browserContext.leaseSessionId),
          lt(schema.browserContext.leaseExpiresAt, now),
        ),
      ),
    )
    .returning({ id: schema.browserContext.id });

  if (!claimed) {
    throw new ContextInUseError(
      `context ${row.id} is already held by another session; start with persistContext: false to run a read-only copy`,
    );
  }

  return { id: row.id, loadKey, saveKey };
}

/** Drop a lease we took but never handed to a running session. */
export async function releaseContext(
  contextId: string,
  sessionId: string,
): Promise<void> {
  await db
    .update(schema.browserContext)
    .set({
      leaseSessionId: null,
      leaseExpiresAt: null,
      leaseSaveKey: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.browserContext.id, contextId),
        eq(schema.browserContext.leaseSessionId, sessionId),
      ),
    );
}

/**
 * Settle a context when the session holding its lease ends: promote the newly
 * written snapshot to current, or record the failure and keep the previous
 * version. Always releases the lease — a save failure must not leave the
 * context stuck unwritable.
 */
export async function settleContext(
  sessionId: string,
  result: ContextSaveResult,
): Promise<void> {
  const now = new Date();
  const saved = result.saved;

  await db
    .update(schema.browserContext)
    .set({
      status: saved ? "ready" : "failed",
      // Only touch the pointer on success. On failure the columns keep their
      // current values, so the context still loads its last good snapshot.
      ...(saved
        ? {
            // Promote the exact key this lease reserved, read from the row
            // itself so the pointer can't drift from what was written.
            snapshotKey: sql`${schema.browserContext.leaseSaveKey}`,
            version: sql`${schema.browserContext.version} + 1`,
            sizeBytes: result.sizeBytes ?? null,
            errorMessage: null,
          }
        : { errorMessage: result.error ?? "context save failed" }),
      leaseSessionId: null,
      leaseExpiresAt: null,
      leaseSaveKey: null,
      lastUsedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.browserContext.id, result.id),
        eq(schema.browserContext.leaseSessionId, sessionId),
      ),
    );

  logger.info("context settled", {
    contextId: result.id,
    sessionId,
    saved,
    cookies: result.cookies,
    origins: result.origins,
  });
}

/** Strip the proxy password before persisting, as `browser_session` does. */
export function redactProxy(proxy?: ProxyOptions): ProxyOptions | undefined {
  if (!proxy?.password) return proxy;
  return { ...proxy, password: undefined };
}

/** Serialize a row into the user-facing API shape. */
export function toContextRecord(row: BrowserContextRow): BrowserContextRecord {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    version: row.version,
    sizeBytes: row.sizeBytes,
    inUseBy:
      row.leaseSessionId &&
      row.leaseExpiresAt &&
      row.leaseExpiresAt.getTime() > Date.now()
        ? row.leaseSessionId
        : null,
    fingerprint: row.fingerprint,
    errorMessage: row.errorMessage,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
