import type {
  BrowserContextStatus,
  FingerprintOptions,
  ProxyOptions,
} from "@repo/types";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * A reusable browser profile: cookies + localStorage captured from a session and
 * replayed into later ones, so an agent logs in once instead of every run.
 *
 * The snapshot itself lives in object storage, not here — this row is only the
 * pointer plus the coordination state. `snapshotKey`/`version` are flipped
 * together after a successful upload and a new version is written to a fresh
 * key every time, so a failed or partial save can never destroy a working
 * profile: the old key stays referenced until the new one is durable.
 *
 * `proxy` and `fingerprint` are pinned to the context rather than the session
 * on purpose. Providers that fingerprint (Google especially) tie a session to
 * the network and browser identity it was minted on, so a context whose exit IP
 * or user agent changes between runs gets challenged — which looks exactly like
 * the account takeover those checks exist to catch.
 *
 * `status` is plain text typed to `BrowserContextStatus` (not a pg enum),
 * matching `browser_session` — new statuses ship as a code change, no ALTER TYPE.
 */
export const browserContext = pgTable(
  "browser_context",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name"),
    status: text("status")
      .$type<BrowserContextStatus>()
      .notNull()
      .default("ready"),
    /** Storage key of the current snapshot; null until the first save lands. */
    snapshotKey: text("snapshot_key"),
    /** Bumped on each successful save. 0 means "never saved" (a fresh context). */
    version: integer("version").notNull().default(0),
    sizeBytes: integer("size_bytes"),
    /** Redacted like `browser_session.options` — no proxy password at rest. */
    proxy: jsonb("proxy").$type<ProxyOptions>(),
    fingerprint: jsonb("fingerprint").$type<FingerprintOptions>(),
    // No write lease: several sessions may persist to one context at once.
    // Each writes back only what it changed relative to the snapshot it loaded,
    // merged onto the current version, so concurrent writers don't erase each
    // other. `version` is the concurrency control — a commit only lands if the
    // version it merged from is still current (see `commitSnapshot`).
    errorMessage: text("error_message"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index("browser_context_user_idx").on(t.userId)],
);
