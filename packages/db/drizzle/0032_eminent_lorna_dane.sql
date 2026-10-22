ALTER TABLE "summary_update_assessment" ADD COLUMN "change_kind" text NOT NULL DEFAULT 'new_fact';--> statement-breakpoint
ALTER TABLE "summary_update_assessment" ALTER COLUMN "change_kind" DROP DEFAULT;
