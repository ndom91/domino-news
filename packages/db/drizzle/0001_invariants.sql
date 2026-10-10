-- Append-only tables: observations, article revisions and summary versions.
-- Legal/privacy deletion of observations is possible with: SET LOCAL dn.allow_observation_delete = 'on'.
CREATE OR REPLACE FUNCTION dn_reject_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'observation'
     AND current_setting('dn.allow_observation_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only (% rejected)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER observation_immutable BEFORE UPDATE OR DELETE ON observation
  FOR EACH ROW EXECUTE FUNCTION dn_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER article_revision_immutable BEFORE UPDATE OR DELETE ON article_revision
  FOR EACH ROW EXECUTE FUNCTION dn_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER story_summary_version_immutable BEFORE UPDATE OR DELETE ON story_summary_version
  FOR EACH ROW EXECUTE FUNCTION dn_reject_mutation();
--> statement-breakpoint
-- A published Story must have at least one active source Article.
CREATE OR REPLACE FUNCTION dn_story_publish_requires_article() RETURNS trigger AS $$
BEGIN
  IF NEW.published_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM story_article sa
    WHERE sa.story_id = NEW.id AND sa.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'story % cannot be published without an active source article', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER story_publish_requires_article BEFORE INSERT OR UPDATE OF published_at ON story
  FOR EACH ROW EXECUTE FUNCTION dn_story_publish_requires_article();
