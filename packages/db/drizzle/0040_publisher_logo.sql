CREATE TABLE "publisher_logo" (
	"domain" text PRIMARY KEY NOT NULL,
	"image" "bytea",
	"content_type" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publisher_logo_image_type" CHECK (("publisher_logo"."image" is null) = ("publisher_logo"."content_type" is null))
);
