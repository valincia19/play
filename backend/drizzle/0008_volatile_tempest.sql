ALTER TABLE "subscriptions" ADD COLUMN "max_videos" integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "max_storage" integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "max_bandwidth" integer DEFAULT -1 NOT NULL;