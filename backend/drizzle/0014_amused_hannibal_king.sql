CREATE TABLE "storage_buckets" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"name" text NOT NULL,
	"region" text,
	"endpoint" text,
	"access_key" text NOT NULL,
	"secret_key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'online' NOT NULL,
	"encryption_version" integer DEFAULT 1 NOT NULL,
	"max_storage_bytes" bigint DEFAULT 0 NOT NULL,
	"used_storage_bytes" bigint DEFAULT 0 NOT NULL,
	"last_health_check_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "hls_path" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "thumbnail_path" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "duration" integer;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "bucket_id" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "file_size_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "storage_buckets" ADD CONSTRAINT "storage_buckets_provider_id_storage_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."storage_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_bucket_id_storage_buckets_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "public"."storage_buckets"("id") ON DELETE set null ON UPDATE no action;