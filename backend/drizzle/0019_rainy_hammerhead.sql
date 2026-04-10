CREATE TABLE "tracking_events" (
	"id" text PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"event_type" text NOT NULL,
	"session_id" text NOT NULL,
	"viewer_fingerprint" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_unique_view_per_viewer" ON "tracking_events" USING btree ("video_id","viewer_fingerprint") WHERE "tracking_events"."event_type" = 'view';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_unique_ad_per_provider" ON "tracking_events" USING btree ("video_id","session_id","metadata") WHERE "tracking_events"."event_type" = 'ad_impression';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_unique_watch_per_session" ON "tracking_events" USING btree ("video_id","session_id") WHERE "tracking_events"."event_type" = 'watch_progress';--> statement-breakpoint
CREATE INDEX "idx_tracking_video_id" ON "tracking_events" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "idx_tracking_event_type" ON "tracking_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_tracking_created_at" ON "tracking_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_tracking_fingerprint" ON "tracking_events" USING btree ("viewer_fingerprint");