CREATE TABLE "booking_event_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"host_user_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"slot_step_minutes" integer DEFAULT 30 NOT NULL,
	"buffer_before_minutes" integer DEFAULT 0 NOT NULL,
	"buffer_after_minutes" integer DEFAULT 0 NOT NULL,
	"min_notice_minutes" integer DEFAULT 240 NOT NULL,
	"max_days_ahead" integer DEFAULT 60 NOT NULL,
	"time_zone" text NOT NULL,
	"weekly_hours" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_time_off" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"event_type_id" uuid,
	"host_user_id" text,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"guest_name" text NOT NULL,
	"guest_email" text NOT NULL,
	"guest_notes" text,
	"guest_time_zone" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"meeting_room_id" uuid,
	"manage_token_hash" text NOT NULL,
	"ics_uid" text NOT NULL,
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"ip_hash" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_manage_token_hash_unique" UNIQUE("manage_token_hash")
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "booking_slug" text;--> statement-breakpoint
ALTER TABLE "booking_event_types" ADD CONSTRAINT "booking_event_types_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_event_types" ADD CONSTRAINT "booking_event_types_host_user_id_user_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_time_off" ADD CONSTRAINT "booking_time_off_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_event_type_id_booking_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."booking_event_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_host_user_id_user_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_meeting_room_id_meeting_rooms_id_fk" FOREIGN KEY ("meeting_room_id") REFERENCES "public"."meeting_rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_event_types_ws_slug_idx" ON "booking_event_types" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "booking_event_types_host_idx" ON "booking_event_types" USING btree ("host_user_id");--> statement-breakpoint
CREATE INDEX "booking_time_off_user_idx" ON "booking_time_off" USING btree ("user_id","ends_at");--> statement-breakpoint
CREATE INDEX "bookings_host_starts_idx" ON "bookings" USING btree ("host_user_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_workspace_starts_idx" ON "bookings" USING btree ("workspace_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_meeting_room_idx" ON "bookings" USING btree ("meeting_room_id");--> statement-breakpoint
CREATE INDEX "bookings_ip_created_idx" ON "bookings" USING btree ("ip_hash","created_at");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_booking_slug_unique" UNIQUE("booking_slug");