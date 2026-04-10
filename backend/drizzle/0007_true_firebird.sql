CREATE TYPE "public"."transaction_type" AS ENUM('purchase', 'give', 'renew');--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"max_videos" integer DEFAULT -1 NOT NULL,
	"max_storage" integer DEFAULT -1 NOT NULL,
	"max_bandwidth" integer DEFAULT -1 NOT NULL,
	"duration_days" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" RENAME COLUMN "plan" TO "plan_id";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "plan" TO "plan_id";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "plan_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "type" "transaction_type" DEFAULT 'purchase' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "plan";--> statement-breakpoint
DROP TYPE "public"."user_plan";