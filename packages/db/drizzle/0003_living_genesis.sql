ALTER TABLE "api_token" ADD COLUMN "token_hash" text;--> statement-breakpoint
CREATE INDEX "api_token_token_hash_idx" ON "api_token" USING btree ("token_hash");