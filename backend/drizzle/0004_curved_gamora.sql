CREATE TYPE "public"."user_plan" AS ENUM('free', 'creator', 'pro');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" "user_plan" DEFAULT 'free' NOT NULL;