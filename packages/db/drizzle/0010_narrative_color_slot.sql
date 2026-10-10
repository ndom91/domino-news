ALTER TABLE "narrative" ADD COLUMN "color_slot" integer;--> statement-breakpoint
-- Backfill: the six most recently updated Narratives get slots 1–6.
UPDATE "narrative" n SET "color_slot" = r.slot
FROM (SELECT id, row_number() OVER (ORDER BY updated_at DESC) AS slot FROM "narrative") r
WHERE n.id = r.id AND r.slot <= 6;
