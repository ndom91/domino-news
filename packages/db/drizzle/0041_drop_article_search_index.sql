-- Matching now finds neighbour articles in Postgres (pgvector), so articles are no longer
-- projected into Typesense. Drop their outbox events and projection state; the indexer no
-- longer knows the 'article' aggregate.
DELETE FROM "outbox_event" WHERE "aggregate_type" = 'article';--> statement-breakpoint
DELETE FROM "search_projection_state" WHERE "aggregate_type" = 'article';
