ALTER TABLE "transactions" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "payment_number" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "total_payment" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "expired_at" timestamp with time zone;