ALTER TYPE "public"."transaction_status" ADD VALUE 'pending' BEFORE 'success';--> statement-breakpoint
ALTER TYPE "public"."transaction_status" ADD VALUE 'paid' BEFORE 'failed';