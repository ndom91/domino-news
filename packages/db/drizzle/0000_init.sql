CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TYPE "public"."analysis_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."article_body_policy" AS ENUM('metadata_only', 'transient_body_allowed');--> statement-breakpoint
CREATE TYPE "public"."evidence_relationship" AS ENUM('derived_from', 'supports', 'contradicts', 'context');--> statement-breakpoint
CREATE TYPE "public"."observation_type" AS ENUM('article_discovered', 'article_revision_detected', 'source_citation_found', 'primary_document_found', 'correction_notice_found', 'publisher_statement_found');--> statement-breakpoint
CREATE TYPE "public"."source_reference_kind" AS ENUM('publisher_article', 'primary_document', 'dataset', 'official_statement', 'other');--> statement-breakpoint
CREATE TYPE "public"."story_relation" AS ENUM('follows', 'branches_from', 'responds_to', 'corrects', 'provides_context_for', 'related_to');--> statement-breakpoint
CREATE TYPE "public"."story_status" AS ENUM('developing', 'ongoing', 'dormant');--> statement-breakpoint
CREATE TYPE "public"."summary_format" AS ENUM('paragraph', 'bullets');--> statement-breakpoint
CREATE TABLE "analysis_run" (
	"id" text PRIMARY KEY NOT NULL,
	"operation" text NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"pipeline_version" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"status" "analysis_run_status" NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "article" (
	"id" text PRIMARY KEY NOT NULL,
	"publisher_id" text NOT NULL,
	"canonical_url" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"latest_revision_id" text,
	"priority_class" text DEFAULT 'fresh' NOT NULL,
	"pipeline_state" text DEFAULT 'discovered' NOT NULL,
	CONSTRAINT "article_canonical_url_unique" UNIQUE("canonical_url")
);
--> statement-breakpoint
CREATE TABLE "article_embedding" (
	"article_id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"model_id" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"reported_updated_at" timestamp with time zone,
	"title" text NOT NULL,
	"description" text,
	"content_hash" text NOT NULL,
	"previous_revision_id" text
);
--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"display_username" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email"),
	CONSTRAINT "auth_user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed" (
	"id" text PRIMARY KEY NOT NULL,
	"publisher_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_polled_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"etag" text,
	"last_modified" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "feed_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"feed_id" text NOT NULL,
	"article_id" text NOT NULL,
	"external_guid" text,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_event" (
	"consumer" text NOT NULL,
	"event_id" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_event_consumer_event_id_pk" PRIMARY KEY("consumer","event_id")
);
--> statement-breakpoint
CREATE TABLE "ingest_run" (
	"id" text PRIMARY KEY NOT NULL,
	"feed_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"items_seen" integer DEFAULT 0 NOT NULL,
	"articles_created" integer DEFAULT 0 NOT NULL,
	"revisions_created" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "interpretation" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"output" jsonb NOT NULL,
	"analysis_run_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supersedes_interpretation_id" text
);
--> statement-breakpoint
CREATE TABLE "interpretation_evidence" (
	"interpretation_id" text NOT NULL,
	"observation_id" text NOT NULL,
	"relationship" "evidence_relationship" NOT NULL,
	CONSTRAINT "interpretation_evidence_interpretation_id_observation_id_pk" PRIMARY KEY("interpretation_id","observation_id")
);
--> statement-breakpoint
CREATE TABLE "narrative" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title_interpretation_id" text,
	CONSTRAINT "narrative_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "narrative_story" (
	"narrative_id" text NOT NULL,
	"story_id" text NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "narrative_story_narrative_id_story_id_pk" PRIMARY KEY("narrative_id","story_id")
);
--> statement-breakpoint
CREATE TABLE "observation" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "observation_type" NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"source_published_at" timestamp with time zone,
	"source_url" text NOT NULL,
	"collection_method" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"schema_version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_version" integer NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"dead_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipeline_control" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publisher" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"country_code" text,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"article_body_policy" "article_body_policy" DEFAULT 'metadata_only' NOT NULL,
	"policy_note" text,
	"policy_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publisher_slug_unique" UNIQUE("slug"),
	CONSTRAINT "publisher_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "search_projection_state" (
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"indexed_version" integer NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_projection_state_aggregate_type_aggregate_id_pk" PRIMARY KEY("aggregate_type","aggregate_id")
);
--> statement-breakpoint
CREATE TABLE "source_reference" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"kind" "source_reference_kind" NOT NULL,
	"discovered_at" timestamp with time zone NOT NULL,
	CONSTRAINT "source_reference_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "story" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" "story_status" DEFAULT 'developing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_observed_at" timestamp with time zone NOT NULL,
	"last_updated_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"current_summary_id" text,
	"input_fingerprint" text,
	"version" integer DEFAULT 1 NOT NULL,
	"merged_into_story_id" text,
	"embedding" vector(768),
	CONSTRAINT "story_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "story_alias" (
	"alias" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_article" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"article_id" text NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone,
	"confidence" real,
	"analysis_run_id" text,
	"match_method" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_lineage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"from_story_ids" text[] NOT NULL,
	"to_story_ids" text[] NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"reason" text,
	"analysis_run_id" text
);
--> statement-breakpoint
CREATE TABLE "story_relationship" (
	"id" text PRIMARY KEY NOT NULL,
	"from_story_id" text NOT NULL,
	"to_story_id" text NOT NULL,
	"relation" "story_relation" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"analysis_run_id" text,
	"confidence" real,
	CONSTRAINT "story_relationship_no_self" CHECK ("story_relationship"."from_story_id" <> "story_relationship"."to_story_id")
);
--> statement-breakpoint
CREATE TABLE "story_source_reference" (
	"story_id" text NOT NULL,
	"source_reference_id" text NOT NULL,
	"observation_id" text,
	"added_at" timestamp with time zone NOT NULL,
	CONSTRAINT "story_source_reference_story_id_source_reference_id_pk" PRIMARY KEY("story_id","source_reference_id")
);
--> statement-breakpoint
CREATE TABLE "story_summary_source" (
	"summary_version_id" text NOT NULL,
	"article_id" text NOT NULL,
	CONSTRAINT "story_summary_source_summary_version_id_article_id_pk" PRIMARY KEY("summary_version_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "story_summary_version" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"interpretation_id" text,
	"headline" text NOT NULL,
	"body" text NOT NULL,
	"format" "summary_format" DEFAULT 'paragraph' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supersedes_version_id" text,
	"edited_by_user_id" text,
	"input_fingerprint" text
);
--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_publisher_id_publisher_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publisher"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_embedding" ADD CONSTRAINT "article_embedding_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_revision" ADD CONSTRAINT "article_revision_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed" ADD CONSTRAINT "feed_publisher_id_publisher_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publisher"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_entry" ADD CONSTRAINT "feed_entry_feed_id_feed_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_entry" ADD CONSTRAINT "feed_entry_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_run" ADD CONSTRAINT "ingest_run_feed_id_feed_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feed"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpretation" ADD CONSTRAINT "interpretation_analysis_run_id_analysis_run_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpretation_evidence" ADD CONSTRAINT "interpretation_evidence_interpretation_id_interpretation_id_fk" FOREIGN KEY ("interpretation_id") REFERENCES "public"."interpretation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpretation_evidence" ADD CONSTRAINT "interpretation_evidence_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative_story" ADD CONSTRAINT "narrative_story_narrative_id_narrative_id_fk" FOREIGN KEY ("narrative_id") REFERENCES "public"."narrative"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative_story" ADD CONSTRAINT "narrative_story_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_alias" ADD CONSTRAINT "story_alias_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_article" ADD CONSTRAINT "story_article_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_article" ADD CONSTRAINT "story_article_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_article" ADD CONSTRAINT "story_article_analysis_run_id_analysis_run_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_lineage_event" ADD CONSTRAINT "story_lineage_event_analysis_run_id_analysis_run_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_relationship" ADD CONSTRAINT "story_relationship_from_story_id_story_id_fk" FOREIGN KEY ("from_story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_relationship" ADD CONSTRAINT "story_relationship_to_story_id_story_id_fk" FOREIGN KEY ("to_story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_relationship" ADD CONSTRAINT "story_relationship_analysis_run_id_analysis_run_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_source_reference" ADD CONSTRAINT "story_source_reference_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_source_reference" ADD CONSTRAINT "story_source_reference_source_reference_id_source_reference_id_fk" FOREIGN KEY ("source_reference_id") REFERENCES "public"."source_reference"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_source_reference" ADD CONSTRAINT "story_source_reference_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_summary_source" ADD CONSTRAINT "story_summary_source_summary_version_id_story_summary_version_id_fk" FOREIGN KEY ("summary_version_id") REFERENCES "public"."story_summary_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_summary_source" ADD CONSTRAINT "story_summary_source_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_summary_version" ADD CONSTRAINT "story_summary_version_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_summary_version" ADD CONSTRAINT "story_summary_version_interpretation_id_interpretation_id_fk" FOREIGN KEY ("interpretation_id") REFERENCES "public"."interpretation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_run_target_idx" ON "analysis_run" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "analysis_run_started_idx" ON "analysis_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "article_published_at_idx" ON "article" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "article_pipeline_state_idx" ON "article" USING btree ("pipeline_state");--> statement-breakpoint
CREATE INDEX "article_revision_article_idx" ON "article_revision" USING btree ("article_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_entry_feed_article_uq" ON "feed_entry" USING btree ("feed_id","article_id");--> statement-breakpoint
CREATE INDEX "ingest_run_feed_idx" ON "ingest_run" USING btree ("feed_id","started_at");--> statement-breakpoint
CREATE INDEX "interpretation_subject_idx" ON "interpretation" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "narrative_story_story_idx" ON "narrative_story" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "observation_subject_idx" ON "observation" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "observation_observed_at_idx" ON "observation" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox_event" USING btree ("next_attempt_at") WHERE "outbox_event"."processed_at" is null and "outbox_event"."dead_at" is null;--> statement-breakpoint
CREATE INDEX "story_published_idx" ON "story" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "story_last_updated_idx" ON "story" USING btree ("last_updated_at");--> statement-breakpoint
CREATE INDEX "story_article_story_idx" ON "story_article" USING btree ("story_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_article_active_article_uq" ON "story_article" USING btree ("article_id") WHERE "story_article"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "story_relationship_active_uq" ON "story_relationship" USING btree ("from_story_id","to_story_id") WHERE "story_relationship"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "story_relationship_to_idx" ON "story_relationship" USING btree ("to_story_id");--> statement-breakpoint
CREATE INDEX "story_summary_version_story_idx" ON "story_summary_version" USING btree ("story_id","created_at");