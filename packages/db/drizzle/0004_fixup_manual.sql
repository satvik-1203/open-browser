-- Fix-up for a hand-applied 0004.
--
-- An earlier revision of 0004 was run manually. It created `browser_context`
-- with an exclusive write lease; that lease was then replaced by version-based
-- merging (several sessions may write one context, each saving back only its own
-- changes), so those three columns are dead. It also never got recorded in
-- drizzle's bookkeeping table, which is why `db:migrate` tries to replay 0004
-- and fails with "relation browser_context already exists".
--
-- Run this ONCE, with a role that owns browser_context. Afterwards the schema
-- matches packages/db/src/schema/browserContext.ts and `db:migrate` is a no-op.
--
-- Safe to run on live data: it only drops unused columns and inserts one
-- bookkeeping row. The `satvik-gmail` context and its snapshot are untouched.

ALTER TABLE "browser_context" DROP COLUMN IF EXISTS "lease_session_id";
--> statement-breakpoint
ALTER TABLE "browser_context" DROP COLUMN IF EXISTS "lease_expires_at";
--> statement-breakpoint
ALTER TABLE "browser_context" DROP COLUMN IF EXISTS "lease_save_key";
--> statement-breakpoint

-- Tell drizzle 0004 is applied. `created_at` must equal the journal's `when`
-- for 0004 (1785346995967) — the migrator decides what to run by comparing that
-- number, not by the hash.
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT
  '88430f4fb219e0cd1a766c403f1a3f153a7b505156a43797d4f4148a1167d90d',
  1785346995967
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1785346995967
);
