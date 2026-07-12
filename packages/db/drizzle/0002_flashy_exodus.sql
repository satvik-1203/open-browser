CREATE TABLE "browser_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"api_token_id" text,
	"status" text DEFAULT 'starting' NOT NULL,
	"options" jsonb,
	"recording_status" text,
	"error_message" text,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "browser_session" ADD CONSTRAINT "browser_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_session" ADD CONSTRAINT "browser_session_api_token_id_api_token_id_fk" FOREIGN KEY ("api_token_id") REFERENCES "public"."api_token"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "browser_session_user_idx" ON "browser_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "browser_session_user_status_idx" ON "browser_session" USING btree ("user_id","status");