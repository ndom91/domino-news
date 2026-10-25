CREATE TABLE "match_admission" (
	"article_id" text PRIMARY KEY NOT NULL,
	"leader_article_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_admission" ADD CONSTRAINT "match_admission_article_id_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_admission" ADD CONSTRAINT "match_admission_leader_article_id_article_id_fk" FOREIGN KEY ("leader_article_id") REFERENCES "public"."article"("id") ON DELETE no action ON UPDATE no action;