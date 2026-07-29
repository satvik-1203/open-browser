CREATE TABLE "browser_context" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text,
	"status" text DEFAULT 'ready' NOT NULL,
	"snapshot_key" text,
	"version" integer DEFAULT 0 NOT NULL,
	"size_bytes" integer,
	"proxy" jsonb,
	"fingerprint" jsonb,
	"error_message" text,
	"last_used_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "browser_session" ADD COLUMN "context_id" text;--> statement-breakpoint
ALTER TABLE "browser_session" ADD COLUMN "context_persist" text;--> statement-breakpoint
ALTER TABLE "browser_context" ADD CONSTRAINT "browser_context_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "browser_context_user_idx" ON "browser_context" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "browser_session" ADD CONSTRAINT "browser_session_context_id_browser_context_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."browser_context"("id") ON DELETE set null ON UPDATE no action;