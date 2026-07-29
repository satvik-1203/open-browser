CREATE INDEX IF NOT EXISTS "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_token_user_idx" ON "api_token" USING btree ("user_id");--> statement-breakpoint
-- DESC NULLS FIRST, not drizzle's default DESC NULLS LAST: `ORDER BY x DESC`
-- means NULLS FIRST in Postgres, and an index with the other null ordering is a
-- different ordering as far as the planner is concerned — it can't use it to
-- satisfy the sort and silently falls back to scanning and sorting the table.
CREATE INDEX IF NOT EXISTS "browser_session_user_created_idx" ON "browser_session" USING btree ("user_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_session_context_status_idx" ON "browser_session" USING btree ("context_id","status");--> statement-breakpoint
-- Dropped last, not first as generated: `browser_session_user_created_idx` above
-- is what makes this one redundant (user_id leads it), so creating the
-- replacement before removing the original means there is no moment where a
-- user-scoped session query has no index to use.
DROP INDEX IF EXISTS "browser_session_user_idx";
