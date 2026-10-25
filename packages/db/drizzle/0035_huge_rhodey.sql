CREATE TABLE "summary_debounce" (
	"story_id" text PRIMARY KEY NOT NULL,
	"input_fingerprint" text NOT NULL,
	"priority_class" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "summary_debounce" ADD CONSTRAINT "summary_debounce_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;