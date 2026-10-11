CREATE TYPE "public"."publisher_funding_model" AS ENUM('public_broadcaster', 'state', 'commercial', 'nonprofit', 'other');--> statement-breakpoint
CREATE TYPE "public"."publisher_reliability" AS ENUM('reliable', 'no_consensus', 'unreliable', 'deprecated');--> statement-breakpoint
ALTER TABLE "publisher_assessment" ADD COLUMN "funding_model" "publisher_funding_model";--> statement-breakpoint
ALTER TABLE "publisher_assessment" ADD COLUMN "reliability_level" "publisher_reliability";