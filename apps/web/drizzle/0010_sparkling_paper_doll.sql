CREATE TABLE "video_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"author_ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_comments" ADD COLUMN "author_email" text;--> statement-breakpoint
ALTER TABLE "video_comments" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "approval_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "video_approvals" ADD CONSTRAINT "video_approvals_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_approvals_video_id_created_at_idx" ON "video_approvals" USING btree ("video_id","created_at");--> statement-breakpoint
ALTER TABLE "video_comments" ADD CONSTRAINT "video_comments_parent_id_video_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."video_comments"("id") ON DELETE cascade ON UPDATE no action;