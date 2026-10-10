ALTER TABLE "auth_user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
-- CLI-created accounts (the only ones with a username) were the operators before roles existed.
UPDATE "auth_user" SET "role" = 'admin' WHERE "username" IS NOT NULL;
