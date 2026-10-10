CREATE TYPE "public"."publisher_kind" AS ENUM('newsroom', 'official');--> statement-breakpoint
ALTER TABLE "publisher" ADD COLUMN "kind" "publisher_kind" DEFAULT 'newsroom' NOT NULL;--> statement-breakpoint
ALTER TABLE "publisher" ADD COLUMN "license" text;