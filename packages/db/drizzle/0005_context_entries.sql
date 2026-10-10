CREATE TYPE "public"."context_kind" AS ENUM('definition', 'background', 'prerequisite');--> statement-breakpoint
CREATE TABLE "context_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "context_kind" NOT NULL,
	"title" text NOT NULL,
	"normalized_key" text NOT NULL,
	"current_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "context_entry_normalized_key_unique" UNIQUE("normalized_key")
);
--> statement-breakpoint
CREATE TABLE "context_entry_version" (
	"id" text PRIMARY KEY NOT NULL,
	"context_entry_id" text NOT NULL,
	"explanation" text NOT NULL,
	"interpretation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_context" (
	"story_id" text NOT NULL,
	"context_entry_id" text NOT NULL,
	"anchor_text" text NOT NULL,
	"interpretation_id" text NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	CONSTRAINT "story_context_story_id_context_entry_id_pk" PRIMARY KEY("story_id","context_entry_id")
);
--> statement-breakpoint
ALTER TABLE "context_entry_version" ADD CONSTRAINT "context_entry_version_context_entry_id_context_entry_id_fk" FOREIGN KEY ("context_entry_id") REFERENCES "public"."context_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_entry_version" ADD CONSTRAINT "context_entry_version_interpretation_id_interpretation_id_fk" FOREIGN KEY ("interpretation_id") REFERENCES "public"."interpretation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_context" ADD CONSTRAINT "story_context_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_context" ADD CONSTRAINT "story_context_context_entry_id_context_entry_id_fk" FOREIGN KEY ("context_entry_id") REFERENCES "public"."context_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_context" ADD CONSTRAINT "story_context_interpretation_id_interpretation_id_fk" FOREIGN KEY ("interpretation_id") REFERENCES "public"."interpretation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "context_entry_version_entry_idx" ON "context_entry_version" USING btree ("context_entry_id");