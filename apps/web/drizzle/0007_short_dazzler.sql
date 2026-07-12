CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "workspace_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "workspace_role" DEFAULT 'member' NOT NULL,
	"token" text NOT NULL,
	"invited_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "workspace_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"brand_name" text,
	"brand_logo" text,
	"brand_color" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "active_workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_invites_workspace_id_idx" ON "workspace_invites" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_ws_user_idx" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
-- Add videos.workspace_id NULLABLE first so existing rows can be backfilled.
ALTER TABLE "videos" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
-- Backfill: one default workspace per existing user, carrying their branding.
INSERT INTO "workspaces" ("id", "name", "brand_name", "brand_logo", "brand_color", "created_by_user_id", "created_at")
SELECT gen_random_uuid(),
       COALESCE(NULLIF("u"."brand_name", ''), NULLIF("u"."name", ''), 'My workspace'),
       "u"."brand_name", "u"."brand_logo", "u"."brand_color",
       "u"."id", now()
FROM "user" "u";--> statement-breakpoint
-- The creator is the workspace owner.
INSERT INTO "workspace_members" ("id", "workspace_id", "user_id", "role", "created_at")
SELECT gen_random_uuid(), "w"."id", "w"."created_by_user_id", 'owner', now()
FROM "workspaces" "w"
WHERE "w"."created_by_user_id" IS NOT NULL;--> statement-breakpoint
-- Point each user at their new default workspace.
UPDATE "user" "u"
SET "active_workspace_id" = "w"."id"
FROM "workspaces" "w"
WHERE "w"."created_by_user_id" = "u"."id";--> statement-breakpoint
-- Assign every existing video to its owner's default workspace.
UPDATE "videos" "v"
SET "workspace_id" = "w"."id"
FROM "workspaces" "w"
WHERE "w"."created_by_user_id" = "v"."owner_id";--> statement-breakpoint
-- Now every row has a workspace, so enforce NOT NULL + FK + index.
ALTER TABLE "videos" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "videos_workspace_id_created_at_idx" ON "videos" USING btree ("workspace_id","created_at" DESC NULLS LAST);
