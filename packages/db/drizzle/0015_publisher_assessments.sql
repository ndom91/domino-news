CREATE TYPE "public"."publisher_lean" AS ENUM('left', 'centre_left', 'centre', 'centre_right', 'right');--> statement-breakpoint
CREATE TABLE "publisher_assessment" (
	"id" text PRIMARY KEY NOT NULL,
	"publisher_id" text NOT NULL,
	"methodology_version" text NOT NULL,
	"country_context" text,
	"ownership" text NOT NULL,
	"reliability" text NOT NULL,
	"lean" "publisher_lean",
	"lean_evidence_url" text,
	"lean_note" text,
	"evidence" jsonb NOT NULL,
	"reviewed_by" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publisher_assessment_lean_cited" CHECK ("publisher_assessment"."lean" is null or "publisher_assessment"."lean_evidence_url" is not null)
);
--> statement-breakpoint
CREATE TABLE "publisher_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"publisher_id" text NOT NULL,
	"source" text NOT NULL,
	"dimension" text NOT NULL,
	"value" text NOT NULL,
	"url" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publisher_assessment" ADD CONSTRAINT "publisher_assessment_publisher_id_publisher_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publisher"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_assessment" ADD CONSTRAINT "publisher_assessment_reviewed_by_auth_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_evidence" ADD CONSTRAINT "publisher_evidence_publisher_id_publisher_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publisher"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publisher_assessment_publisher_idx" ON "publisher_assessment" USING btree ("publisher_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "publisher_evidence_publisher_idx" ON "publisher_evidence" USING btree ("publisher_id");--> statement-breakpoint
-- Reviewed assessments are a history: a re-review inserts a new row.
CREATE TRIGGER publisher_assessment_append_only BEFORE UPDATE OR DELETE ON publisher_assessment
  FOR EACH ROW EXECUTE FUNCTION dn_reject_mutation();
