CREATE TYPE "public"."claim_evidence_relation" AS ENUM('supports', 'contradicts', 'context', 'inconclusive');--> statement-breakpoint
CREATE TYPE "public"."claim_stance" AS ENUM('asserts', 'denies', 'quotes', 'discusses');--> statement-breakpoint
CREATE TABLE "claim" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"proposition" text NOT NULL,
	"interpretation_id" text NOT NULL,
	"summary_version_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "claim_evidence" (
	"claim_id" text NOT NULL,
	"source_reference_id" text NOT NULL,
	"relationship" "claim_evidence_relation" NOT NULL,
	"analysis_run_id" text NOT NULL,
	CONSTRAINT "claim_evidence_claim_id_source_reference_id_pk" PRIMARY KEY("claim_id","source_reference_id")
);
--> statement-breakpoint
CREATE TABLE "claim_mention" (
	"claim_id" text NOT NULL,
	"article_id" text NOT NULL,
	"article_revision_id" text NOT NULL,
	"observation_id" text NOT NULL,
	"stance" "claim_stance" NOT NULL,
	"analysis_run_id" text NOT NULL,
	CONSTRAINT "claim_mention_claim_id_article_id_pk" PRIMARY KEY("claim_id","article_id")
);
--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_interpretation_id_interpretation_id_fk" FOREIGN KEY ("interpretation_id") REFERENCES "public"."interpretation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_source_reference_id_source_reference_id_fk" FOREIGN KEY ("source_reference_id") REFERENCES "public"."source_reference"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_analysis_run_id_analysis_run_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_mention" ADD CONSTRAINT "claim_mention_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_mention" ADD CONSTRAINT "claim_mention_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_mention" ADD CONSTRAINT "claim_mention_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_mention" ADD CONSTRAINT "claim_mention_analysis_run_id_analysis_run_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_story_idx" ON "claim" USING btree ("story_id");