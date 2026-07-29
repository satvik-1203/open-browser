import type { BrowserSessionStatus, StartBrowserOptions } from "@repo/types";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { apiToken } from "./apiToken";
import { browserContext } from "./browserContext";
import { user } from "./auth";

/**
 * One row per browser session, owned by a user. The backend is the source of
 * truth here: it mints the id, drives browser-server, and settles the row via
 * browser-server's end-of-session callback. The `id` is the same id that
 * appears in the session's devtools/ws URL, so there is one handle everywhere.
 *
 * We deliberately do NOT store a recording URL — recording URLs are short-lived
 * signed URLs, minted on demand from the id. We track only `recordingStatus`.
 * The stored `options` are the start options with any proxy password redacted.
 *
 * `status` is a plain text column typed to `BrowserSessionStatus` (not a pg
 * enum) so new statuses ship as a code change, with no `ALTER TYPE` migration.
 */
export const browserSession = pgTable(
  "browser_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Which credential opened the session; null when it was a web session.
    apiTokenId: text("api_token_id").references(() => apiToken.id, {
      onDelete: "set null",
    }),
    status: text("status")
      .$type<BrowserSessionStatus>()
      .notNull()
      .default("starting"),
    // Which context this session loaded, if any. `set null` on delete: the
    // session log is history and outlives the profile it used.
    contextId: text("context_id").references(() => browserContext.id, {
      onDelete: "set null",
    }),
    // Whether this session held the context's write lease. A read-only session
    // (the default) is a fork — it loads the snapshot and never saves back,
    // which is what lets several run against one context at once.
    contextPersist: text("context_persist").$type<"read" | "write">(),
    options: jsonb("options").$type<StartBrowserOptions>(),
    recordingStatus: text("recording_status"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [
    // Serves "list this user's live sessions".
    index("browser_session_user_status_idx").on(t.userId, t.status),
    // Serves the dashboard's session list: filtered by owner, ordered by
    // (createdAt, id) DESC, and keyset-paginated on exactly that pair. With
    // only (user_id) to work from, Postgres has to read and sort every one of a
    // user's sessions to return any page, and this is the table that grows for
    // the life of the account. A plain (user_id) index would be redundant with
    // this one: user_id leads it, so anything that could serve, this serves too.
    //
    // `nullsFirst` is load-bearing, not decoration. `ORDER BY x DESC` means
    // `DESC NULLS FIRST` in Postgres, and an index declared `DESC NULLS LAST`
    // (drizzle's default for `.desc()`) is a different ordering — so the planner
    // can't use it to satisfy the sort, and quietly falls back to scanning and
    // sorting the lot. Both columns are NOT NULL, so this changes nothing about
    // what the index *contains*; it only makes the ordering match the query.
    index("browser_session_user_created_idx").on(
      t.userId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    // `context_id` is a foreign key, and an unindexed foreign key is scanned
    // twice over: once by `countWriters` on every context page, and once by
    // Postgres itself on every context delete, which has to find the rows it
    // must set null. `status` rides along because the only question either
    // asks is which of a context's sessions are still live.
    index("browser_session_context_status_idx").on(t.contextId, t.status),
  ],
);
