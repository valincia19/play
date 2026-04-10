ALTER TABLE "plans" ADD COLUMN "capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;