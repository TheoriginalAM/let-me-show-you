ALTER TABLE "user" ADD COLUMN "approved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Grandfather every existing user: they predate the invite gate, so keep them approved.
UPDATE "user" SET "approved" = true;