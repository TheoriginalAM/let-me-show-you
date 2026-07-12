CREATE TABLE "video_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"author_ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_comments" ADD CONSTRAINT "video_comments_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_comments_video_id_created_at_idx" ON "video_comments" USING btree ("video_id","created_at");