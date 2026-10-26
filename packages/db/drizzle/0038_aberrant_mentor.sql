ALTER TABLE "story" ADD COLUMN "locations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preference" ADD COLUMN "locality" jsonb;--> statement-breakpoint
CREATE INDEX "story_locations_idx" ON "story" USING gin ("locations");