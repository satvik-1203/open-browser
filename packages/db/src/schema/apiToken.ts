import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Per-user API tokens minted by the dashboard and validated by the backend.
 *
 * The token handed to the user is an opaque random secret (`ob_…`, see
 * `@repo/crypto`). We store only its SHA-256 hash in `tokenHash` and look the
 * row up by that hash on each request to resolve the owner + enforce revocation
 * — the raw token is never persisted.
 */
export const apiToken = pgTable(
  "api_token",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** SHA-256 hash of the token secret; the lookup key on authentication. */
    tokenHash: text("token_hash"),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index("api_token_token_hash_idx").on(t.tokenHash)],
);
