CREATE TABLE "video_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"markdown" text DEFAULT '' NOT NULL,
	"instructions" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"published" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"at_seconds" integer NOT NULL,
	"viewer_key" text NOT NULL,
	"viewer_ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"reporter_email" text,
	"reporter_ip_hash" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_comments" ADD COLUMN "at_seconds" integer;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "transcript_status" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "transcript_track_id" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "transcript" jsonb;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "chapters" jsonb;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "notes_status" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "notes_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "expiry_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "video_documents" ADD CONSTRAINT "video_documents_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_documents" ADD CONSTRAINT "video_documents_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_reactions" ADD CONSTRAINT "video_reactions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_reports" ADD CONSTRAINT "video_reports_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_documents_video_id_created_at_idx" ON "video_documents" USING btree ("video_id","created_at");--> statement-breakpoint
CREATE INDEX "video_reactions_video_id_at_idx" ON "video_reactions" USING btree ("video_id","at_seconds");--> statement-breakpoint
CREATE INDEX "video_reactions_video_id_viewer_idx" ON "video_reactions" USING btree ("video_id","viewer_key");--> statement-breakpoint
CREATE INDEX "video_reports_created_at_idx" ON "video_reports" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "videos_mux_asset_id_idx" ON "videos" USING btree ("mux_asset_id");--> statement-breakpoint
CREATE INDEX "videos_expires_at_idx" ON "videos" USING btree ("expires_at");