CREATE TABLE "optional_enrichment_completion" (
	"story_id" text NOT NULL,
	"summary_version_id" text NOT NULL,
	"kind" text NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "optional_enrichment_completion_story_id_summary_version_id_kind_model_id_prompt_version_pk" PRIMARY KEY("story_id","summary_version_id","kind","model_id","prompt_version"),
	CONSTRAINT "optional_enrichment_completion_kind" CHECK ("optional_enrichment_completion"."kind" in ('context', 'claims'))
);
--> statement-breakpoint
ALTER TABLE "match_admission" ADD COLUMN "input_fingerprint" text;--> statement-breakpoint
ALTER TABLE "match_admission" ADD COLUMN "priority_class" text;--> statement-breakpoint
UPDATE "match_admission" m
SET "input_fingerprint" = a."latest_revision_id", "priority_class" = 'fresh'
FROM "article" a
WHERE a."id" = m."article_id";--> statement-breakpoint
ALTER TABLE "match_admission" ALTER COLUMN "input_fingerprint" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "match_admission" ALTER COLUMN "priority_class" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "optional_enrichment_completion" ADD CONSTRAINT "optional_enrichment_completion_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optional_enrichment_completion" ADD CONSTRAINT "optional_enrichment_completion_summary_version_id_story_summary_version_id_fk" FOREIGN KEY ("summary_version_id") REFERENCES "public"."story_summary_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_admission" ADD CONSTRAINT "match_admission_priority_class" CHECK ("match_admission"."priority_class" in ('interactive', 'fresh', 'backfill'));--> statement-breakpoint
ALTER TABLE "summary_debounce" ADD CONSTRAINT "summary_debounce_priority_class" CHECK ("summary_debounce"."priority_class" in ('interactive', 'fresh', 'backfill'));
--> statement-breakpoint
INSERT INTO "optional_enrichment_completion" ("story_id", "summary_version_id", "kind", "model_id", "prompt_version")
SELECT DISTINCT ar.target_id, ar.input_fingerprint, 'context', ar.model_id, ar.prompt_version
FROM "analysis_run" ar
JOIN "interpretation" i ON i.analysis_run_id = ar.id AND i.type = 'context_entry'
JOIN "story_context" sc ON sc.interpretation_id = i.id
JOIN "story" s ON s.id = ar.target_id AND s.current_summary_id = ar.input_fingerprint
WHERE ar.operation = 'story_context' AND ar.status = 'succeeded'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "optional_enrichment_completion" ("story_id", "summary_version_id", "kind", "model_id", "prompt_version")
SELECT DISTINCT ar.target_id, ar.input_fingerprint, 'claims', ar.model_id, ar.prompt_version
FROM "analysis_run" ar
JOIN "interpretation" i ON i.analysis_run_id = ar.id AND i.type = 'claim'
JOIN "claim" c ON c.interpretation_id = i.id AND c.superseded_at IS NULL
JOIN "story" s ON s.id = ar.target_id AND s.current_summary_id = ar.input_fingerprint
WHERE ar.operation = 'story_claims' AND ar.status = 'succeeded'
ON CONFLICT DO NOTHING;
