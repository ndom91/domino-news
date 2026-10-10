# Domino News: agent and contributor notes

Planning and architecture live in [`docs/`](docs/README.md). Decisions taken while building are in [`docs/006-implementation-notes.md`](docs/006-implementation-notes.md).

## Repository

```text
apps/web          TanStack Start app (SSR) + /api/v1 and /api/auth mounts
apps/worker       worker, indexer and CLI entry points
packages/schemas  Zod API + inference contracts
packages/domain   pure utilities (ids, URL normalisation, story-graph rules)
packages/db       Drizzle schema, migrations (incl. invariant triggers)
packages/server   server-only services: auth, reads, writes, outbox, search, API router
packages/jobs     pipeline: ingest, embed, match, summarise, relate, context, claims, backfill, worker runtime
packages/inference fixture / local (OpenAI-compatible) / disabled cloud adapters
packages/api-client, packages/queries   shared HTTP client + TanStack Query options
packages/design-tokens, packages/ui      tokens, primitives and editorial components
playroom/         Playroom config, fixtures and snippets
fixtures/         publishers.json and captured RSS (metadata only)
infra/compose     Compose file and Dockerfile
e2e/, test/       Playwright and Vitest suites
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` | Web dev server / production build (`apps/web/server.mjs` serves it) |
| `pnpm dev:worker` | Pipeline workers (watch mode) |
| `pnpm --filter @dn/worker dev:indexer` | Outbox → Typesense indexer |
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
| `pnpm cli enrich:all [--reset-graph]` | Re-run relationships, narratives, context and claims for published stories |
| `pnpm cli backfill:pause` / `backfill:resume` | Control backfill admission |
| `pnpm cli status` | Pipeline and queue status as JSON |
| `pnpm cli dev:reset` | Delete all ingested and derived data (keeps users and publishers) |

## Configuration

### Fixture mode

The default `.env.example` runs fixture ingest and fixture inference. Older fixture items count as backfill and are admitted at `BACKFILL_ADMIT_PER_MINUTE` (20/min), so the full set settles in 2–3 minutes. Watch progress on **Pipeline** (`/ops`).

### Local inference (EmbeddingGemma 2 + Gemma 4)

```bash
INFERENCE_MODE=local
INFERENCE_BASE_URL=https://your-inference-host/v1     # OpenAI-compatible /embeddings + /chat/completions
INFERENCE_API_KEY=...
INFERENCE_GENERATION_MODEL=gemma-4-26B-A4B
INFERENCE_EMBEDDING_MODEL=embeddinggemma-2           # must return 768-d vectors
INFERENCE_CA_CERT=/abs/path/to/private-ca.pem        # only for a private CA
```

Fixture and model embeddings live in different vector spaces. When you switch modes, run `pnpm cli dev:reset` and ingest again.

### Google sign-in (optional)

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_ALLOWED_EMAILS=you@gmail.com,someone@example.com
```

Create an OAuth client (type "Web application") in Google Cloud and add `${BETTER_AUTH_URL}/api/auth/callback/google` as an authorised redirect URI. The login page shows the Google button only when both client values are set. Google can only create accounts for allowlisted emails. It does not link to existing `user:create` accounts.

### Live RSS

`INGEST_MODE=live` polls the real feeds in `fixtures/publishers.json` on `FEED_POLL_CRON` (default every 15 minutes), or once with `pnpm cli ingest`. Conditional requests (ETag / Last-Modified) avoid refetching unchanged feeds.

## Full stack with Docker Compose

```bash
cp .env.example .env    # set BETTER_AUTH_SECRET, BETTER_AUTH_URL (public origin), inference settings
# optional private CA: put it at infra/compose/certs/inference-ca.pem
docker compose -f infra/compose/compose.yaml --profile app up -d --build
docker compose -f infra/compose/compose.yaml --profile app run --rm worker pnpm cli seed
docker compose -f infra/compose/compose.yaml --profile app run --rm worker pnpm cli user:create --username you --password '...'
```

Services: `postgres` (pgvector), `typesense`, `migrate` (one-off), `web` (port `WEB_PORT`, default 4000), `worker`, `indexer`. TLS termination (Caddy) and backups are not included yet.

## API

All routes require a session: the cookie from the web app, or `Authorization: Bearer <token>` from `POST /api/auth/sign-in/username` (response header `set-auth-token`). Passkeys are managed through better-auth's own `/api/auth/passkey/*` endpoints (web: `/account`).

```text
GET  /api/v1/stories?cursor=&limit=
GET  /api/v1/stories/:idOrSlug          # includes summary, sources, context[], claims[], related
POST /api/v1/stories/:id/summary          # dev-only edit -> new version (ENABLE_SUMMARY_EDITING)
GET  /api/v1/narratives
GET  /api/v1/narratives/:idOrSlug
GET  /api/v1/search?q=&type=&since=&publisher=
GET  /api/v1/publishers                  # outlet stats + who-covered-what matrix
GET  /api/v1/publishers/:slug            # stats, source-use policy, recent stories, co-coverage
GET  /api/v1/ops/status
POST /api/v1/ops/actions                  # pause_backfill | resume_backfill | poll_all_feeds | rebuild_search
```

Contracts are Zod schemas in `packages/schemas`. `packages/api-client` and `packages/queries` are platform-neutral for a future Expo app.

## What works

- RSS/Atom/RDF ingestion with URL normalisation, dedupe, revision tracking, immutable observations and per-feed failure isolation.
- A durable pg-boss pipeline with priorities, reserved fresh capacity, rate-limited and pausable backfill, retries, stale-job rejection, and per-model GPU concurrency caps.
- Conservative Story matching (EmbeddingGemma shortlist, Gemma 4 decision, `uncertain` supported) and typed Story relationships with temporal and cycle validation.
- Grounded, versioned summaries: citations are validated against the Story's own articles and observations. Edits create new versions, and stale outputs never overwrite newer ones.
- Narratives from connected Stories, with model-written titles.
- **Context popovers:** model-written background for names and terms in a summary. Each entry must anchor to the summary's exact text and cite the Story's own articles; entries are shared across Stories and versioned. Human summary edits trigger regeneration.
- **Claims (lite):** up to five checkable statements per Story, with each outlet's stance (reports, attributes, mentions, disputes) and links to primary documents when known. Not a verification of truth.
- **Publisher coverage:** outlet stats (stories, first to report, only source), a who-covered-what matrix, and per-publisher pages with source-use policy and co-coverage. No political or credibility ratings.
- Transactional outbox → idempotent indexer → Typesense; alias-swapped rebuild; hybrid search with automatic keyword fallback during an inference outage.
- Web: feed, Story, Narrative (branching lane graph), publishers, search, pipeline and account pages. Desktop-first and checked at 375px.
- Auth: username/password, passkeys and optional Google sign-in (better-auth), bearer tokens for API clients; sign-up closed except Google for allowlisted emails.
- Tests: Vitest (invariants, pipeline, API contracts) and Playwright smoke tests (desktop and mobile).

## Fixture-only or limited

- **Fixture inference** is a deterministic stand-in (bag-of-words vectors, token-overlap decisions). Its grouping is noticeably coarser than the real models'.
- **Article bodies:** every seeded publisher is `metadata_only`. The transient-body path, and primary-source discovery that depends on it, is implemented but unused. The policy review was best-effort, not legal advice; get permission before production ingestion.
- **Matching thresholds** are calibrated on about 34 articles only (see doc 006).
- **Merge/split:** the data model and alias resolution exist; there is no operation or UI.
- **Ops page** is a diagnostics view, not an admin product.
- **Claims evidence** needs primary sources, which are only discovered from publishers that allow body processing. All seeded publishers are `metadata_only`, so evidence links stay empty for now.

## Deferred (per doc 005)

Full claims/evidence graph (cross-story claim linking, verification), publisher bias assessment, personal blindspots, Expo app, notifications, billing, Caddy/TLS, backups, OpenTofu/Ansible.
