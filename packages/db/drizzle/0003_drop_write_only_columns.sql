DROP TABLE "ingest_run" CASCADE;--> statement-breakpoint
ALTER TABLE "article" DROP COLUMN "priority_class";--> statement-breakpoint
ALTER TABLE "feed" DROP COLUMN "consecutive_failures";