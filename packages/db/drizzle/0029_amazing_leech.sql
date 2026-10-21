CREATE TABLE "user_publisher_mute" (
	"user_id" text NOT NULL,
	"publisher_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_publisher_mute_user_id_publisher_id_pk" PRIMARY KEY("user_id","publisher_id")
);
--> statement-breakpoint
ALTER TABLE "user_preference" ADD COLUMN "briefing_last_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_publisher_mute" ADD CONSTRAINT "user_publisher_mute_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_publisher_mute" ADD CONSTRAINT "user_publisher_mute_publisher_id_publisher_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publisher"("id") ON DELETE cascade ON UPDATE no action;