CREATE TABLE "reading_event" (
	"user_id" text NOT NULL,
	"story_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_event_user_id_story_id_pk" PRIMARY KEY("user_id","story_id")
);
--> statement-breakpoint
ALTER TABLE "user_preference" ADD COLUMN "remember_reads" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_event" ADD CONSTRAINT "reading_event_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_event" ADD CONSTRAINT "reading_event_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reading_event_read_at_idx" ON "reading_event" USING btree ("read_at");