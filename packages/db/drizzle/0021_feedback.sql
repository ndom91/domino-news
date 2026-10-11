CREATE TABLE "user_signal" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"weight" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_signal_user_id_kind_key_pk" PRIMARY KEY("user_id","kind","key")
);
--> statement-breakpoint
CREATE TABLE "user_story_feedback" (
	"user_id" text NOT NULL,
	"story_id" text NOT NULL,
	"signal" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_story_feedback_user_id_story_id_pk" PRIMARY KEY("user_id","story_id")
);
--> statement-breakpoint
ALTER TABLE "user_signal" ADD CONSTRAINT "user_signal_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_story_feedback" ADD CONSTRAINT "user_story_feedback_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_story_feedback" ADD CONSTRAINT "user_story_feedback_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE cascade ON UPDATE no action;