CREATE TABLE "story_update_event" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"origin" text NOT NULL,
	"summary_version_id" text,
	"related_story_id" text,
	"analysis_run_id" text,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_update_event_source" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"article_id" text,
	"source_reference_id" text,
	CONSTRAINT "story_update_event_source_one_target" CHECK (("story_update_event_source"."article_id" is null) <> ("story_update_event_source"."source_reference_id" is null))
);
--> statement-breakpoint
ALTER TABLE "story_update_event" ADD CONSTRAINT "story_update_event_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_update_event" ADD CONSTRAINT "story_update_event_summary_version_id_story_summary_version_id_fk" FOREIGN KEY ("summary_version_id") REFERENCES "public"."story_summary_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_update_event" ADD CONSTRAINT "story_update_event_related_story_id_story_id_fk" FOREIGN KEY ("related_story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_update_event" ADD CONSTRAINT "story_update_event_analysis_run_id_analysis_run_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."analysis_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_update_event_source" ADD CONSTRAINT "story_update_event_source_event_id_story_update_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."story_update_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_update_event_source" ADD CONSTRAINT "story_update_event_source_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_update_event_source" ADD CONSTRAINT "story_update_event_source_source_reference_id_source_reference_id_fk" FOREIGN KEY ("source_reference_id") REFERENCES "public"."source_reference"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "story_update_event_story_idx" ON "story_update_event" USING btree ("story_id","created_at");--> statement-breakpoint
CREATE INDEX "story_update_event_recent_idx" ON "story_update_event" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "story_update_event_source_event_idx" ON "story_update_event_source" USING btree ("event_id");
--> statement-breakpoint
CREATE FUNCTION prevent_story_update_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'story update events are append-only';
  END IF;
  IF OLD.story_id IS DISTINCT FROM NEW.story_id
    OR OLD.kind IS DISTINCT FROM NEW.kind
    OR OLD.description IS DISTINCT FROM NEW.description
    OR OLD.origin IS DISTINCT FROM NEW.origin
    OR OLD.summary_version_id IS DISTINCT FROM NEW.summary_version_id
    OR OLD.related_story_id IS DISTINCT FROM NEW.related_story_id
    OR OLD.analysis_run_id IS DISTINCT FROM NEW.analysis_run_id
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
    OR OLD.superseded_at IS NOT NULL
    OR NEW.superseded_at IS NULL THEN
    RAISE EXCEPTION 'story update events may only be superseded once';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER story_update_event_append_only BEFORE UPDATE OR DELETE ON story_update_event
FOR EACH ROW EXECUTE FUNCTION prevent_story_update_event_mutation();
--> statement-breakpoint
CREATE FUNCTION validate_story_update_event_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_story_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'story update event sources are append-only';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'story update event sources cannot be changed';
  END IF;
  SELECT story_id INTO event_story_id FROM story_update_event WHERE id = NEW.event_id;
  IF NEW.article_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM story_article
    WHERE story_id = event_story_id AND article_id = NEW.article_id AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'event article source must be active on its story';
  END IF;
  IF NEW.source_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM story_source_reference
    WHERE story_id = event_story_id AND source_reference_id = NEW.source_reference_id
  ) THEN
    RAISE EXCEPTION 'event primary source must be linked to its story';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER story_update_event_source_valid BEFORE INSERT OR UPDATE OR DELETE ON story_update_event_source
FOR EACH ROW EXECUTE FUNCTION validate_story_update_event_source();
