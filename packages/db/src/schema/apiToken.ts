import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Per-user API tokens minted by the dashboard and validated by the backend.
 *
 * The token string handed to the user is the AES-256-GCM encryption of
 * `{ userId, tokenId }` (see `@repo/crypto`). This row is looked up by
 * `tokenId` (= `id`) on each request to enforce revocation — we never store the
 * raw token, only its metadata.
 */
export const apiToken = pgTable("api_token", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});
