-- The single edition becomes the first of the For You regions.
UPDATE "user_preference" SET "regions" = ARRAY["edition"] WHERE "edition" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preference" DROP COLUMN "edition";
