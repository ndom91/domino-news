CREATE TYPE "public"."lean_basis" AS ENUM('sourced', 'estimated');--> statement-breakpoint
ALTER TABLE "publisher_assessment" ADD COLUMN "lean_basis" "lean_basis";--> statement-breakpoint
-- Every lean published so far came from a survey or rating. The table is append-only,
-- so the trigger is lifted for this one backfill and restored straight after.
ALTER TABLE "publisher_assessment" DISABLE TRIGGER "publisher_assessment_append_only";--> statement-breakpoint
UPDATE "publisher_assessment" SET "lean_basis" = 'sourced' WHERE "lean" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "publisher_assessment" ENABLE TRIGGER "publisher_assessment_append_only";--> statement-breakpoint
ALTER TABLE "publisher_assessment" ADD CONSTRAINT "publisher_assessment_lean_basis" CHECK (("publisher_assessment"."lean" is null) = ("publisher_assessment"."lean_basis" is null));