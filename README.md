# Domino News — prototype

An evidence-linked news reader. It ingests RSS metadata from a curated set of publishers, records immutable observations, groups articles into **Stories** (discrete developments), writes source-linked AI summaries with local models, links Stories into branching **Narratives**, and serves it all through a login-protected TanStack Start web app and a versioned JSON API.

Planning and architecture live in [`docs/`](docs/README.md). Decisions taken while building are in [`docs/006-implementation-notes.md`](docs/006-implementation-notes.md).

## Quick start (fixture mode, no GPU)

Requires Node 24, pnpm (`corepack enable`), and Docker.

```bash
pnpm install
cp .env.example .env                                   # fixture mode by default
docker compose -f infra/compose/compose.yaml up -d postgres typesense
pnpm db:migrate
pnpm cli seed                                          # 12 publishers + feeds
pnpm cli user:create --username dev --password dev-password-change-me

# three terminals
pnpm dev:worker                                        # pg-boss workers
pnpm --filter @dn/worker dev:indexer                   # outbox -> Typesense
pnpm dev                                               # web on http://localhost:3000

pnpm cli ingest                                        # poll every feed once
```

Older fixture items count as backfill and are admitted at `BACKFILL_ADMIT_PER_MINUTE` (20/min), so the full set settles in 2–3 minutes. Watch progress on **Pipeline** (`/ops`).

## Local inference (EmbeddingGemma 2 + Gemma 4)

Set in `.env`:

```bash
INFERENCE_MODE=local
INFERENCE_BASE_URL=https://your-inference-host/v1     # OpenAI-compatible /embeddings + /chat/completions
INFERENCE_API_KEY=...
INFERENCE_GENERATION_MODEL=gemma-4-26B-A4B
INFERENCE_EMBEDDING_MODEL=embeddinggemma-2           # must return 768-d vectors
INFERENCE_CA_CERT=/abs/path/to/private-ca.pem        # only for a private CA
```

Fixture and model embeddings live in different vector spaces. When you switch modes, run `pnpm cli dev:reset` and ingest again.

## Live RSS

`INGEST_MODE=live` polls the real feeds in `fixtures/publishers.json` on `FEED_POLL_CRON` (default every 15 minutes), or once with `pnpm cli ingest`. Conditional requests (ETag / Last-Modified) avoid refetching unchanged feeds.

## Full stack with Docker Compose

```bash
cp .env.example .env    # set BETTER_AUTH_SECRET, BETTER_AUTH_URL (public origin), inference settings
# optional private CA: put it at infra/compose/certs/inference-ca.pem
docker compose -f infra/compose/compose.yaml --profile app up -d --build
docker compose -f infra/compose/compose.yaml --profile app run --rm worker pnpm cli seed
docker compose -f infra/compose/compose.yaml --profile app run --rm worker pnpm cli user:create --username you --password '...'
```

Services: `postgres` (pgvector), `typesense`, `migrate` (one-off), `web` (port `WEB_PORT`, default 3000), `worker`, `indexer`. TLS termination (Caddy) and backups are not included yet.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` | Web dev server / production build (`apps/web/server.mjs` serves it) |
| `pnpm dev:worker` | Pipeline workers (watch mode) |
| `pnpm playroom` | Component playground on http://localhost:9000 |
| `pnpm check` / `pnpm format` / `pnpm lint` | Biome |
| `pnpm typecheck` | `tsc` in every package |
| `pnpm test` | Vitest: unit + integration (needs Compose Postgres; uses database `dn_test`) |
| `pnpm test:e2e` | Playwright smoke tests against a running app (`E2E_BASE_URL`, `DEV_USERNAME`, `DEV_PASSWORD`) |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migrations |
| `pnpm cli seed` | Upsert publishers and feeds |
| `pnpm cli ingest [--variant rss-update]` | Poll all feeds now (fixture variant `rss-update` simulates a second poll) |
| `pnpm cli user:create --username u --password p` | Create an account (public sign-up is disabled) |
| `pnpm cli search:rebuild` | Rebuild Typesense from Postgres and swap aliases |
| `pnpm cli relate:all [--reset]` | Re-run relationship + narrative detection |
| `pnpm cli backfill:pause` / `backfill:resume` | Control backfill admission |
| `pnpm cli status` | Pipeline and queue status as JSON |
| `pnpm cli dev:reset` | Delete all ingested and derived data (keeps users and publishers) |

## API

All routes require a session: the cookie from the web app, or `Authorization: Bearer <token>` from `POST /api/auth/sign-in/username` (response header `set-auth-token`).

```text
GET  /api/v1/stories?cursor=&limit=
GET  /api/v1/stories/:idOrSlug
POST /api/v1/stories/:id/summary          # dev-only edit -> new version (ENABLE_SUMMARY_EDITING)
GET  /api/v1/narratives
GET  /api/v1/narratives/:idOrSlug
GET  /api/v1/search?q=&type=&since=&publisher=
GET  /api/v1/publishers
GET  /api/v1/ops/status
POST /api/v1/ops/actions                  # pause_backfill | resume_backfill | poll_all_feeds | rebuild_search
```

Contracts are Zod schemas in `packages/schemas`; `packages/api-client` and `packages/queries` are platform-neutral for a future Expo app.

## Repository

```text
apps/web          TanStack Start app (SSR) + /api/v1 and /api/auth mounts
apps/worker       worker, indexer and CLI entry points
packages/schemas  Zod API + inference contracts
packages/domain   pure utilities (ids, URL normalisation, story-graph rules)
packages/db       Drizzle schema, migrations (incl. invariant triggers)
packages/server   server-only services: auth, reads, writes, outbox, search, API router
packages/jobs     pipeline: ingest, embed, match, summarise, relate, backfill, worker runtime
packages/inference fixture / local (OpenAI-compatible) / disabled cloud adapters
packages/api-client, packages/queries   shared HTTP client + TanStack Query options
packages/design-tokens, packages/ui      tokens, primitives and editorial components
playroom/         Playroom config, fixtures and snippets
fixtures/         publishers.json and captured RSS (metadata only)
infra/compose     Compose file and Dockerfile
e2e/, test/       Playwright and Vitest suites
```

## What works

- RSS/Atom/RDF ingestion with URL normalisation, dedupe, revision tracking, immutable observations and per-feed failure isolation.
- A durable pg-boss pipeline with priorities, reserved fresh capacity, rate-limited and pausable backfill, retries, stale-job rejection, and per-model GPU concurrency caps.
- Conservative Story matching (EmbeddingGemma shortlist, Gemma 4 decision, `uncertain` supported) and typed Story relationships with temporal and cycle validation.
- Grounded, versioned summaries: citations are validated against the Story's own articles and observations. Edits create new versions, and stale outputs never overwrite newer ones.
- Narratives from connected Stories, with model-written titles.
- Transactional outbox → idempotent indexer → Typesense; alias-swapped rebuild; hybrid search with automatic keyword fallback during an inference outage.
- Web: feed, Story, Narrative (branching lane graph), search, and pipeline pages, plus login. Desktop-first and checked at 375px.
- Tests: 30 Vitest tests (invariants, pipeline, API contracts) and Playwright smoke tests (desktop and mobile).

## Fixture-only or limited

- **Fixture inference** is a deterministic stand-in (bag-of-words vectors, token-overlap decisions). Its grouping is noticeably coarser than the real models'.
- **Article bodies:** every seeded publisher is `metadata_only`. The transient-body path, and primary-source discovery that depends on it, is implemented but unused. The policy review was best-effort, not legal advice; get permission before production ingestion.
- **Matching thresholds** are calibrated on about 34 articles only (see doc 006).
- **Merge/split:** the data model and alias resolution exist; there is no operation or UI.
- **Ops page** is a diagnostics view, not an admin product.
- The **CI e2e job** was written but has not run on GitHub yet.

## Deferred (per doc 005)

Claims/evidence graph, publisher bias assessment, personal blindspots, context popovers beyond the summary explainer, passkeys (planned better-auth plugin), Expo app, notifications, billing, Caddy/TLS, backups, OpenTofu/Ansible.
