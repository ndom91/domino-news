CREATE TYPE "public"."push_delivery_status" AS ENUM('planned', 'sending', 'accepted', 'delivered', 'failed', 'unknown');--> statement-breakpoint
CREATE TABLE "push_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"subscription_generation" integer NOT NULL,
	"story_id" text NOT NULL,
	"expo_ticket_id" text,
	"status" "push_delivery_status" DEFAULT 'planned' NOT NULL,
	"error" text,
	"receipt_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "push_delivery_expo_ticket_id_unique" UNIQUE("expo_ticket_id")
);
--> statement-breakpoint
ALTER TABLE "push_subscription" ADD COLUMN "generation" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "push_delivery" ADD CONSTRAINT "push_delivery_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_delivery" ADD CONSTRAINT "push_delivery_story_id_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_delivery_subscription_story_idx" ON "push_delivery" USING btree ("token","subscription_generation","story_id");--> statement-breakpoint
CREATE INDEX "push_delivery_receipt_idx" ON "push_delivery" USING btree ("status","receipt_checked_at");