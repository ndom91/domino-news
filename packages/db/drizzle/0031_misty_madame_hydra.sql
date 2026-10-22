CREATE TABLE "summary_update_assessment" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"prior_summary_version_id" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"outcome" text NOT NULL,
	"note" text NOT NULL,
	"source_article_ids" jsonb NOT NULL,
	"observation_ids" jsonb NOT NULL,
	"analysis_run_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "summary_update_assessment" ADD CONSTRAINT "summary_update_assessment_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_update_assessment" ADD CONSTRAINT "summary_update_assessment_prior_summary_version_id_story_summary_version_id_fk" FOREIGN KEY ("prior_summary_version_id") REFERENCES "public"."story_summary_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_update_assessment" ADD CONSTRAINT "summary_update_assessment_analysis_run_id_analysis_run_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "summary_update_assessment_pair_uq" ON "summary_update_assessment" USING btree ("story_id","prior_summary_version_id","input_fingerprint");