ALTER TABLE "folders" ADD COLUMN "path" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "depth" integer DEFAULT 0 NOT NULL;