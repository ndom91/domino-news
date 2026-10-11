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
| `pnpm cli user:create --username u --password p [--role user]` | Create an account (public sign-up is disabled). CLI accounts are admins unless `--role user` |
| `pnpm cli user:role --username u --role admin\|user` | Promote or demote an account |
| `pnpm cli assessments:import` | Refresh publisher evidence from Wikidata (ownership), Wikipedia's perennial sources (reliability) and `fixtures/lean-evidence.json` (lean) |
| `pnpm cli assessments:publish --username u [--dry-run]` | Publish the reviewed assessments in `fixtures/assessments.json` as admin `u`. Skips publishers whose latest assessment already matches. Run `assessments:import` first |
| `pnpm cli search:rebuild` | Rebuild Typesense from Postgres and swap aliases |
| `pnpm cli enrich:all [--reset-graph]` | Re-run relationships, narratives, context and claims for published stories |
| `pnpm cli summaries:refresh` | Re-summarise published stories that have no desk yet (one GPU call each, plus context, claims and relate for the new version) |
| `pnpm cli backfill:pause` / `backfill:resume` | Control backfill admission |
| `pnpm cli status` | Pipeline and queue status as JSON |
| `pnpm cli dev:reset` | Delete all ingested and derived data (keeps users and publishers) |

## Configuration

### Fixture mode

The default `.env.example` runs fixture ingest and fixture inference. Older fixture items count as backfill and are admitted at `BACKFILL_ADMIT_PER_MINUTE` (20/min), so the full set settles in 2–3 minutes. Watch progress on **Pipeline** (`/ops`).

A Story is published only once `MIN_PUBLISH_OUTLETS` (default 2) newsroom publishers cover it, so single-outlet fixture Stories stay hidden. CI sets it to 1 so e2e data settles quickly.

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
```

Create an OAuth client (type "Web application") in Google Cloud and add `${BETTER_AUTH_URL}/api/auth/callback/google` as an authorised redirect URI. The login page shows the Google button only when both client values are set. Any Google account can sign up. It does not link to existing `user:create` accounts.

### Publisher logos (optional)

```bash
LOGO_DEV_API_KEY=sk_...   # logo.dev secret key
```

The web server fetches each publisher's logo once through the logo.dev API, keeps it in memory, and serves it at `/api/v1/logos/<slug>.webp` without a session. It's cached for a year in browsers and at Cloudflare. logo.dev's fair use forbids proxying its CDN (`img.logo.dev`), so only the API is used. Without the key, publishers show no logo.

### Live RSS

`INGEST_MODE=live` polls the real feeds in `fixtures/publishers.json` on `FEED_POLL_CRON` (default every 15 minutes), or once with `pnpm cli ingest`. Conditional requests (ETag / Last-Modified) avoid refetching unchanged feeds.

## Full stack with Docker Compose

```bash
cp .env.example .env    # set BETTER_AUTH_SECRET, BETTER_AUTH_URL (public origin), inference settings
# optional private CA: put it at infra/compose/certs/inference-ca.pem and set INFERENCE_CA_CERT=/certs/inference-ca.pem
scripts/deploy.sh up            # compose up --build (migrate runs first), then cli seed
scripts/deploy.sh user you      # cli user:create, prompts for the password
scripts/deploy.sh update        # git pull --ff-only, then the same as up
```

Services: `postgres` (pgvector), `typesense`, `migrate` (one-off), `web` (bound to `WEB_BIND:WEB_PORT`, default `127.0.0.1:4000`), `worker`, `indexer`. Postgres and Typesense always bind to `127.0.0.1`. TLS termination (Caddy) is not included yet. Backups: `scripts/deploy.sh backup` (pg_dump into `backups/` on the host; offsite copies are left to the operator; see README).

## Operations

Recipes for running and maintaining the stack. `scripts/deploy.sh cli <command>` runs any `pnpm cli` command inside the worker image.

### Frontend work with hot reload

Run the web app on the host and everything else in Docker. `.env` already points at the published ports (Postgres `localhost:5442`, Typesense `localhost:8108`).

```bash
docker compose --env-file .env -f infra/compose/compose.yaml --profile app stop web   # frees port 4000
pnpm dev
```

- Hot reload covers the shared packages too (`ui`, `queries`, `schemas`, `server`).
- The pipeline does not reload: for worker changes, stop the `worker` container and run `pnpm dev:worker`.
- Mounting the source into containers is not supported: macOS-built `node_modules` don't run in the Linux image.
- `scripts/deploy.sh up` starts the `web` container again; stop it before `pnpm dev`.

### Full reset (switching modes, or starting clean)

```bash
# 1. Set INGEST_MODE / INFERENCE_MODE in .env
scripts/deploy.sh up                  # rebuild and recreate containers with the new .env
scripts/deploy.sh cli dev:reset       # delete stories, articles, jobs (keeps users and publishers)
scripts/deploy.sh cli search:rebuild  # fresh, empty search collections
scripts/deploy.sh cli ingest          # poll every feed now
```

- The order matters: `dev:reset` does not touch Typesense, so rebuild search after it.
- Switching `INFERENCE_MODE` always needs a reset: fixture and model embeddings live in different vector spaces.
- `up` builds from the **working tree, not git**: uncommitted changes end up in the image.

### Deploying to prod

```bash
scripts/deploy.sh backup     # before any update that has migrations
scripts/deploy.sh update     # git pull, rebuild, migrate, restart, re-seed publishers
```

- **Migrations only go forward.** There are no down migrations, so rolling back code does not undo the schema; restore a backup instead.
- After a change to the search schema (a new field on the story collection), run `scripts/deploy.sh cli search:rebuild`.
- New model-written fields (desk, regions, topics) are only set when a Story is summarised. Existing Stories stay without them until re-summarised or a full reset.
- After `fixtures/assessments.json` changes, run `scripts/deploy.sh cli assessments:import`, then `scripts/deploy.sh cli assessments:publish --username <admin>` (try `--dry-run` first). Assessments are append-only, so each changed entry becomes a new version.
- After adding publishers, run `scripts/deploy.sh cli assessments:import` once so they get ownership and reliability evidence. It is not scheduled: evidence changes rarely, and only reviewed assessments are shown.

### Backups and restore

```bash
scripts/deploy.sh backup                          # pg_dump into backups/, prunes dumps older than 14 days
scripts/deploy.sh restore backups/dn-<time>.dump  # asks first, takes a safety dump, restores, rebuilds search
```

Nightly cron (adjust the path):

```cron
15 3 * * * cd /opt/domino-news && scripts/deploy.sh backup >> /var/log/domino-backup.log 2>&1
```

- `pg_dump` runs inside the Postgres container, so the host needs no Postgres tools.
- Typesense is not backed up; `restore` rebuilds it.
- Copying `backups/` offsite is up to the operator. Keep `.env` safe too: restored data needs the same `BETTER_AUTH_SECRET`.

### Known issues

- **"pg-boss database requires migrations" on the Pipeline page.** The pg-boss schema in the database is newer than the pg-boss package (a newer pg-boss ran against it once). The worker still starts (it runs with `migrate: true`), but the web server checks for an exact match. Set the version back to what the package expects (`schema` in `node_modules/pg-boss/package.json`, currently 44):

  ```bash
  docker compose --env-file .env -f infra/compose/compose.yaml exec -T postgres \
    psql -U dn -d dn -c "update pgboss.version set version = 44;"
  ```

- **Tests and the clock.** Fixture articles carry fixed dates. Assertions about "the last 24 hours" or the For You 72-hour window must move data to `now()` first, or they break as the fixtures age.

## Server guidelines

- In a correlated `sql` subquery, write outer columns literally (`narrative.id`), not as `${schema.narrative.id}`. Drizzle drops the table name from select-list columns when the query has no joins, and a bare `"id"` then binds to the subquery's own tables.

## Frontend guidelines

Follow these for any UI work in `apps/web` and `packages/ui`. They come from the [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) and the issues a full review found here.

**Build with what exists**
- Use the `@dn/ui` primitives (`Button`, `TextInput`, `Popover`, `Menu`, `Tooltip`, `ConfirmDialog`, `Notice`) and the type roles (`type-label`, `type-meta`, `type-section` …) before writing new markup or raw text sizes.
- Colours come from tokens only. On a Narrative or desk fill use `key-fill`. It also switches the focus ring to a colour that stays visible on the fill.
- For muted text on a fill, use a solid token (`text-key-text-muted`). Never use `opacity-*`, which drops below contrast AA.
- Don't name a theme key after a CSS display value (`grid`, `flex`, `block`, `table`). Tailwind's `inline-*`/`block-*` size utilities would give classes like `inline-grid` a second meaning. `packages/design-tokens/theme.test.ts` guards this.

**Accessibility**
- Every page has exactly one `h1`, including empty, error and login states (use `sr-only` if it shouldn't show).
- Use `<button>` for actions and `<a>`/`<Link>` for navigation. Never put `onClick` on a `div` or `span`.
- Icon-only and repeated controls need an `aria-label` that names the item ("Remove Work laptop", "Source 2: Reuters").
- Keep the global `:focus-visible` outline. Don't remove outlines.
- Anything clickable shows the pointer cursor. The base layer sets it for buttons, `role="button"`, selects and `summary`; set `cursor-pointer` on other custom clickables.
- Tap targets are at least 44px (`min-h-tap`). Small inline controls such as citations get an invisible enlarged hit area.
- In-page anchor targets get `scroll-mt-*` and a `:target` style.
- Mark decorative SVGs and icons `aria-hidden`. Charts need a text alternative.
- Put `aria-live="polite"` on a short status line (e.g. a result count), never on a whole list.

**Forms and actions**
- Inputs get `name`, `autoComplete`, the right `type`, and a visible label. Usernames, emails and codes also get `spellCheck={false}` and `autoCapitalize="none"`.
- Give pending state to the button that was pressed, and keep it until navigation finishes. Re-enable buttons only on error.
- Destructive or expensive actions (removing a passkey, pausing backfill, rebuilding search) go through `ConfirmDialog`.
- Guard unsaved edits on cancel, route change and tab close.
- Errors say what happened and what to do next.

**State and data**
- Filters, search and pagination live in the URL. Form fields must follow the URL on back and forward (key the form on the search params). Options a field needs come from the route loader.
- Expect empty lists, missing data and bad URLs. Every list has an empty state. Never call `new URL()` unguarded in render (use `hostnameOf`). Guard maths against empty arrays.
- Format dates and times with the `@dn/domain` helpers (`Intl`-based). Relative times can differ between server and client, so pass a loader-fixed `now` or render them client-side.

**Copy**
- Write for readers, not operators. No pipeline terms (poll, backfill, embedding, outbox, CLI commands) outside `/ops`.
- One name per thing: **publisher** (not outlet or source), **story** (not development), **narrative**.
- Pluralise counts with `plural()`. Use "…" (not "...") and curly quotes in UI text. Button labels say exactly what happens ("Remove passkey", not "Submit").

**Motion**
- Animate only `transform`, `scale`, `opacity` and a small `filter: blur`, using the duration tokens. Those tokens drop to 0 under `prefers-reduced-motion`. Never use `transition-all`.
- Reuse the `t-*` recipes in `packages/design-tokens/motion.css` before writing new motion: `t-popup`, `t-tooltip`, `t-modal` (Base UI popups), `t-acc` (`<details>`), `t-skel`, `t-reveal` (via `useReveal` / `<Reveal>`, which skips server-rendered content), `t-pop`, `t-shimmer`, `t-shake`.

## API

All routes except the logo route require a session: the cookie from the web app, or `Authorization: Bearer <token>` from `POST /api/auth/sign-in/username` (response header `set-auth-token`). Passkeys are managed through better-auth's own `/api/auth/passkey/*` endpoints (web: `/account`).

```text
GET  /api/v1/front?region=                # lead (prefers the reader's regions), stats, developing narratives
GET  /api/v1/stories?cursor=&limit=&region=
GET  /api/v1/stories/:idOrSlug          # includes summary, sources, context[], claims[], related
POST /api/v1/stories/:id/summary          # dev-only edit -> new version (ENABLE_SUMMARY_EDITING)
GET  /api/v1/narratives
GET  /api/v1/narratives/:idOrSlug
GET  /api/v1/search?q=&type=&since=&publisher=&region=
GET  /api/v1/publishers                  # publisher stats + who-covered-what matrix
GET  /api/v1/publishers/:slug            # stats, source-use policy, coverage profile, assessment, co-coverage
GET  /api/v1/logos/:slug.webp         # public (no session): publisher logo, 404 when none
GET  /api/v1/publishers/:slug/evidence   # admin: imported, unreviewed evidence
POST /api/v1/publishers/:slug/assessment # admin: publish a reviewed assessment (new version)
GET  /api/v1/ops/status                  # admin only
POST /api/v1/ops/actions                  # admin only: pause_backfill | resume_backfill | poll_all_feeds | rebuild_search
GET  /api/v1/me/preferences              # { regions, desks, topics, rememberReads, country, onboarded }
GET  /api/v1/me/follows                  # followed narratives and publishers
POST /api/v1/me/follows                  # { targetType, targetId, follow: boolean }
GET  /api/v1/for-you?cursor=             # ranked personal feed with reasons and the reader's tap
POST /api/v1/me/feedback                 # { storyId, signal: 'more' | 'less' | null } (null = undo)
GET  /api/v1/me/signals                  # what For You learned from feedback
POST /api/v1/me/signals                  # { reset: true } | { remove: { kind, key } }
POST /api/v1/me/preferences              # partial update; rememberReads=false deletes history
POST /api/v1/me/reads                    # { storyId }; recorded only if rememberReads
GET  /api/v1/me/insights                 # Blindspot: newer stories in narratives you read, region/desk gaps, one-sided stories
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
- **Regions:** each generated summary tags 1-3 macro-regions the Story concerns (not where outlets are based). The feed filters by region, and the lead prefers a Story in one of the reader's regions.
- **For You (`/for-you`):** readers pick regions, desks and topics (on `/onboarding` at first sign-in, `/account` or the page itself) and follow narratives or publishers. Each generated summary tags 0-3 of 25 fixed topics (`TOPICS` in `packages/schemas`). Stories from the last 72 hours are ranked, not filtered: followed narrative +3, topic +2, followed outlet, region and desk +1 each, plus wider coverage, minus age. Every card says why it's there. Paging is an offset into the ranked window. The front page shows the top 4 as a "For you" rail once a reader has picks, follows or learned signals. Thumbs up / down on For You cards nudge learned weights for the Story's topics, desk, regions and narratives (never its publishers): ±1 per tap (regions ±0.5), clamped to ±3 and halved every 30 days. "Less" also hides the Story; undo reverses the tap (approximately, since weights are clamped). Readers see and reset what was learned on `/account`.
- **Blindspot (`/blindspot`):** opt-in reading history (off by default, kept 30 days, deleted when turned off). Insights are computed on request: newer Stories in narratives you read, and regions or desks with many Stories this week that you rarely read. Nothing about the reader's politics is inferred or stored. A "Covered mostly by one side" section shows even with history off: this week's Stories where at least 3 of the covering publishers in the reader's country are rated and 75% or more lean the same way.
- **Publisher assessments:** evidence is imported from open sources only: Wikidata for ownership (CC0), and Wikipedia's perennial sources list for reliability (CC BY-SA). An admin reviews it on the publisher page and publishes an append-only, versioned assessment that freezes the evidence used. Political lean is entered by hand, relative to the outlet's own country, and must cite a source such as the Reuters Institute's audience data; otherwise it shows "Not assessed".
- **Political lean on Stories:** each Story shows the reviewed lean of its newsroom publishers, one ink-only bar per country (leans aren't comparable across countries), with unrated publishers always shown as their own hatched segment. A country needs 2 rated publishers to get a bar. The reader's country comes from their `/account` setting, else Cloudflare's `CF-IPCountry` header. The publishers page shows each lean and filters by it (`?lean=`).
- **Lean evidence:** `fixtures/lean-evidence.json` holds hand-checked ratings, loaded by `assessments:import`. Neither source has an open download, so each entry is copied by hand from the source page (or the chart data behind it), with its URL and date. AllSides (CC BY-NC 4.0, attribution shown with its evidence) rates on the US scale only, so it only pre-fills US publishers. Reuters Institute DNR audience scores are relative to the outlet's own country and win over AllSides. The review form pre-fills the lean from them; an admin still publishes it. Non-commercial sources are fine for now: **re-check every source's licence before any commercial use.** MBFC (terms unclear), Ad Fontes and NewsGuard (paid) are not used.
- **Publisher coverage:** publisher stats (stories, first to report), a who-covered-what matrix, and per-publisher pages with source-use policy, co-coverage and a coverage profile: desk and region mix against all Stories (30 days), how often an official source sits alongside it, and widely covered Stories it missed this week.
- Transactional outbox → idempotent indexer → Typesense; alias-swapped rebuild; hybrid search with automatic keyword fallback during an inference outage.
- Web: feed, For You, Story, Narrative (timeline), Blindspot, publishers, search, pipeline, account and onboarding pages, and a 404 page. Desktop-first and checked at 375px; below 1024px the header nav becomes a section menu.
- Auth: username/password, passkeys and optional Google sign-in (better-auth), bearer tokens for API clients; sign-up closed except through Google. An `admin` role gates the Pipeline page and assessment review.
- Tests: Vitest (invariants, pipeline, API contracts) and Playwright smoke tests (desktop and mobile).

## Fixture-only or limited

- **Fixture inference** is a deterministic stand-in (bag-of-words vectors, token-overlap decisions). Its grouping is noticeably coarser than the real models'.
- **Article bodies:** 10 of 65 seeded publishers allow transient bodies (open licences or public domain, commercial use allowed). Federal Register and EU Commission pages need an API or a JS-capable fetcher, so they fall back to metadata for now. Fixture mode only has captured RSS for the original 12 publishers. The policy review was best-effort, not legal advice; get permission before production ingestion.
- **Matching thresholds** are calibrated on about 34 articles only (see doc 006).
- **Merge/split:** the data model and alias resolution exist; there is no operation or UI.
- **Ops page** is a diagnostics view for admins (`role = admin`), not an admin product.
- **Claims evidence** needs primary sources, which are only discovered from publishers that allow body processing. All seeded publishers are `metadata_only`, so evidence links stay empty for now.

## Deferred (per doc 005)

Full claims/evidence graph (cross-story claim linking, verification), automated political-lean ratings, Expo app, notifications, billing, Caddy/TLS, OpenTofu/Ansible.
