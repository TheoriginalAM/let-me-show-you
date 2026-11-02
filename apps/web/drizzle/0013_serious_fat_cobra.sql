CREATE TABLE "slug_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"old_slug" text NOT NULL,
	"target_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_event_types" ADD COLUMN "questions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_event_types" ADD COLUMN "confirmation_message" text;--> statement-breakpoint
ALTER TABLE "booking_event_types" ADD COLUMN "reminders_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_event_types" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "answers" jsonb;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "reminder_day_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "reminder_hour_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD COLUMN "welcome_message" text;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD COLUMN "accent_color" text;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD COLUMN "background" text;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD COLUMN "background_image" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "brand_theme" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "brand_font" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "brand_cover" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "brand_photo" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "brand_bio" text;--> statement-breakpoint
ALTER TABLE "slug_redirects" ADD CONSTRAINT "slug_redirects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slug_redirects_kind_scope_slug_idx" ON "slug_redirects" USING btree ("kind","scope","old_slug");--> statement-breakpoint
CREATE INDEX "slug_redirects_target_idx" ON "slug_redirects" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "bookings_status_starts_idx" ON "bookings" USING btree ("status","starts_at");