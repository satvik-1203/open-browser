import type { BrowserSessionStatus, StartBrowserOptions } from "@repo/types";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { apiToken } from "./apiToken";
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
    index("browser_session_user_idx").on(t.userId),
    // Serves "list this user's live sessions".
    index("browser_session_user_status_idx").on(t.userId, t.status),
  ],
);
