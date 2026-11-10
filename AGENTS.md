# Domino Wire: agent and contributor notes

Planning and architecture live in [`docs/`](docs/README.md). Decisions taken while building are in [`docs/006-implementation-notes.md`](docs/006-implementation-notes.md).

## Repository

```text
apps/web          TanStack Start app (SSR) + /api/v1 and /api/auth mounts
apps/worker       worker, indexer and CLI entry points
packages/schemas  Zod API + inference contracts
packages/domain   pure utilities (ids, URL normalisation, story-graph rules)
packages/db       Drizzle schema, migrations (incl. invariant triggers)
packages/server   server-only services: auth, reads, writes, outbox, search, API router
packages/jobs     pipeline: ingest, embed, match, summarise, relate, context, backfill, worker runtime
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
| `bash test/compose-deploy.test.sh <local-app-image>` | Verify migration ordering and failure isolation in disposable local Compose services (requires Docker) |
| `bash test/docker-permissions.test.sh` | Check image source permissions and dependency caching with a local Docker build |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migrations |
| `pnpm cli seed` | Upsert publishers and feeds |
| `pnpm cli ingest [--variant rss-update]` | Poll all feeds now (fixture variant `rss-update` simulates a second poll) |
| `pnpm cli user:create --username u --password p [--role user]` | Create an account without the public sign-up form. CLI accounts are admins unless `--role user` |
| `pnpm cli user:role --username u --role admin\|user` | Promote or demote an account |
| `pnpm cli assessments:import` | Refresh publisher evidence from Wikidata (ownership), Wikipedia's perennial sources (reliability) and `fixtures/lean-evidence.json` (lean) |
| `pnpm cli assessments:publish --username u [--dry-run]` | Publish the reviewed assessments in `fixtures/assessments.json` as admin `u`. Skips publishers whose latest assessment already matches. Run `assessments:import` first |
| `pnpm cli match:sample --name n --seed <regex>` / `match:review --name n` | Draw a match evaluation set of real articles into `fixtures/match-eval/`; write a local review page for its story labels (rules: `docs/story-granularity.md`) |
| `pnpm cli search:rebuild` | Rebuild Typesense from Postgres and swap aliases |
| `pnpm cli enrich:all [--reset-graph]` | Re-run relationships, narratives and context for published stories |
| `pnpm cli summaries:refresh --all` | Re-summarise every published story (one summary call each, at backfill priority; relationship inference runs for the new version, and context is rewritten on the next view; edited summaries are kept) |
| `pnpm cli backfill:pause` / `backfill:resume` | Control backfill admission |
| `pnpm cli status` | Pipeline and queue status as JSON |
| `pnpm cli dev:reset` | Delete all ingested and derived data (keeps users and publishers) |

## Configuration

### Fixture mode

The default `.env.example` runs fixture ingest and fixture inference. Older fixture items count as backfill and are admitted at `BACKFILL_ADMIT_PER_MINUTE` (20/min), so the full set settles in 2–3 minutes. Watch progress on **Pipeline** (`/pipeline`).

A Story is published only once `MIN_PUBLISH_OUTLETS` (default 2) newsroom publishers cover it, so single-outlet fixture Stories stay hidden. CI sets it to 1 so e2e data settles quickly.

Context is optional enrichment, written only when someone reads a Story: an authenticated Story-detail request admits the missing work for that summary version at interactive priority, and the page polls until it is durably complete or terminally failed. Unread versions cost no inference. Tests that need context queue it explicitly (see `test/pipeline.test.ts` setup); `pnpm cli enrich:all` writes it for every published Story.

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

### Legal pages

`/about`, `/privacy`, `/terms` and `/imprint` are public (no sign-in) and linked from every footer and the login page. Operator details (name, email, postal address, hosting provider) live in `apps/web/src/lib/operator.ts`; the imprint shows the address only once it's set. When the content changes, bump `LEGAL_UPDATED_AT` there. The privacy policy's retention table mirrors the code (sessions in `auth.ts`, reading history in `preferences.ts`, backups in `scripts/deploy.sh`): change them together. Code is AGPL-3.0 (`LICENSE`); third-party data keeps its own terms (`NOTICE.md`).

### Mobile app (Expo)

The server is ready for an Expo client through better-auth's `expo()` plugin:

- Native requests carry no `Origin`; `@better-auth/expo/client` sends the app scheme in `expo-origin`, which must be in `trustedOrigins`. Set the scheme with `EXPO_APP_SCHEME` (default `dominonews`, matching `app.json`). Expo Go's `exp://` URLs are trusted only when `NODE_ENV=development`.
- The app talks to `/api/v1` with `@dn/api-client` and the session cookie: `createApiClient({ baseUrl, fetch, credentials: 'omit', headers: async () => ({ cookie: await authClient.getCookie() }) })`. Bearer tokens (`set-auth-token`) also work.
- Native fetch isn't subject to CORS, so `/api/v1` needs no CORS headers for the app (only Expo web would).
- To reach the dev server from a phone, run `pnpm dev --host` (Vite binds to localhost otherwise) and point the app at `http://<LAN IP>:4000`.
- Not supported on native yet: passkeys (WebAuthn needs a native passkey library plus `assetlinks.json` / `apple-app-site-association` on the site) and Google sign-in (needs Android and iOS OAuth client IDs).

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

The web server fetches each publisher's logo once through the logo.dev API, saves it in Postgres (`publisher_logo`), keeps it in memory, and serves it at `/api/v1/logos/<slug>.webp` without a session. It's cached for a year in browsers and at Cloudflare. Each API call costs a logo.dev credit, so saved logos are never fetched again, even after restarts or deploys. "No logo" answers are saved too and asked again after a day. Delete a row to refetch that logo. logo.dev's fair use forbids proxying its CDN (`img.logo.dev`), so only the API is used. Without the key, only logos already saved are shown. `dev:reset` keeps them, and backups include them.

### Audio briefing prototype

On the Briefing page, prepare an on-demand spoken reading of up to five ranked For You summaries. Set `INFERENCE_MODE=local` and configure local generation as above, plus `AUDIO_PROTOTYPE_TTS_URL` (the full URL, e.g. `http://ha-voice-rocm.puff.lan:8880/v1/audio/speech`). Set `AUDIO_PROTOTYPE_TTS_API_KEY` only if the service requires it; `AUDIO_PROTOTYPE_TTS_MODEL` and `AUDIO_PROTOTYPE_TTS_VOICE` default to `kokoro` and `af_heart`. Restart the web server after changing `.env`. The generation model receives the account name and local date and writes a presenter script from the summaries; the speech service receives the complete script in one OpenAI-style WAV request. Readers can change their account name on the Account page; Google sign-ins start with their profile name. The prototype waits for the complete response, stores nothing on the server, and keeps the audio only in the browser page. It does not run on a schedule. Compare the transcript, factual accuracy, and pronunciation with the linked stories before deciding whether to develop it further.

Readers can choose Professional or Radio show in Account preferences. Radio show asks for humorous presenter banter and satirical commercials for invented businesses, while keeping the same factual and sensitive-subject safeguards. The speech adapter is behind `SpeechProvider` in `packages/server/src/speech-provider.ts`.

The audio briefing POST supports `Accept: application/x-ndjson` for live selection, script-writing and voice-recording stages, then a result or error event. Without that Accept header it returns the original JSON response. These are whole-briefing stages, not per-story progress or chapter timestamps.

### Live RSS

`INGEST_MODE=live` polls the real feeds in `fixtures/publishers.json` on `FEED_POLL_CRON` (default every 15 minutes), or once with `pnpm cli ingest`. Conditional requests (ETag / Last-Modified) avoid refetching unchanged feeds.

## Full stack with Docker Compose

```bash
cp .env.example .env    # set BETTER_AUTH_SECRET, BETTER_AUTH_URL (public origin), inference settings
# optional private CA: put it at infra/compose/certs/inference-ca.pem and set INFERENCE_CA_CERT=/certs/inference-ca.pem
scripts/deploy.sh up            # build the shared image once, start (migrate first), then cli seed
scripts/deploy.sh user you      # cli user:create, prompts for the password
scripts/deploy.sh update        # git pull --ff-only, then the same as up
scripts/deploy.sh update-image  # git pull, then pull and deploy the commit-tagged GHCR image
```

Services: `postgres` (pgvector), `typesense`, `migrate` (one-off), `web` (bound to `WEB_BIND:WEB_PORT`, default `127.0.0.1:4000`), `worker`, `indexer`. Postgres and Typesense always bind to `127.0.0.1`. TLS termination (Caddy) is not included yet. Backups: `scripts/deploy.sh backup` (pg_dump into `backups/` on the host; offsite copies are left to the operator; see below).

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
                             # or update-image to pull the published image (see README)
```

- **Migrations only go forward.** There are no down migrations, so rolling back code does not undo the schema; restore a backup instead.
- After a change to the search schema (a new field on the story collection), run `scripts/deploy.sh cli search:rebuild`.
- New model-written fields (desk, regions, topics) are only set when a Story is summarised. Existing Stories stay without them until re-summarised or a full reset.
- After `fixtures/assessments.json` changes, run `scripts/deploy.sh cli assessments:import`, then `scripts/deploy.sh cli assessments:publish --username <admin>` (try `--dry-run` first). Assessments are append-only, so each changed entry becomes a new version.
- After adding publishers, run `scripts/deploy.sh cli assessments:import` once so they get ownership and reliability evidence. It is not scheduled: evidence changes rarely, and only reviewed assessments are shown.
- The local build requires BuildKit and downloads the `docker/dockerfile:1.14` frontend on its first build. Web, worker, indexer and migrations share one image; migrations must succeed before app services start. Compose waits up to 120 seconds for services to be running or healthy, but app services have no health checks, so this does not guarantee readiness.
- If startup fails, the script restores the previous local image tag (or removes the new tag if there was none), but containers may already have changed and migrations are not rolled back. Inspect the stack and database before retrying. If seeding fails after startup, the new image remains active; retry with `scripts/deploy.sh cli seed`.
- GitHub Actions publishes multi-architecture GHCR images for commits on `main`. For `update-image`, make the package public or authenticate with `docker login ghcr.io` using a token with `read:packages`; forks can set `DOMINO_IMAGE_REPOSITORY=ghcr.io/<owner>/<repository>` (lowercase). Use `image-up` for the current checkout without pulling git. If publication or pulling fails, running containers are unchanged. Images contain the committed tree, and publication is independent of CI checks.

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
- `pg_dump` takes a consistent snapshot while Postgres runs; copying the live data directory does not.
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

### Inference workflow invariants

- Match admission only delays duplicate inference. A follower must always rerun `matchArticle`; never attach it directly to the elected leader's Story. Persist and resume the lease's latest fingerprint and priority, not values from a possibly stale wake job.
- `match_admission` and `summary_debounce` are durable intent. The `reconcile_deferred_work` minute job is the recovery path when a pg-boss wake is lost or exhausted; do not delete expired/due rows before reconciliation claims them.
- Optional context is ready only when `optional_enrichment_completion` is committed in the same transaction as their reader data. A successful `analysis_run` alone is not readiness: persistence can still fail, and valid output can be empty.
- Relationship inference reuse requires the exact pair of summary versions, Story input fingerprints, generation model and prompt. Cached decisions still pass current-input, temporal and cycle checks, and embedding/edge/narrative writes must revalidate freshness under lock.

## Performance guidelines

Learned from the October 2026 performance pass. Queries are fast (0.1–6 ms); what costs time is round trips, serial awaits and bytes. Check these before adding a read or a page.

**Server reads**
- Never select `story.embedding` in request paths. Use `storyColumns` from `packages/server/src/reader.ts`, not `select().from(schema.story)`: the vector is about 10 KB per row as text.
- Run independent queries with `Promise.all`. Await in sequence only when a query needs the previous result.
- Fetch only what the page renders. Add a slim read rather than reusing a full one, as `getStoryLead` does for the front-page hero instead of `getStory`.
- Don't run the same work twice in one request. For example, don't build a 30-item list just to pick one item from it.
- Bound every list query with a `limit`, and filter to the subject before aggregating. Don't aggregate every publisher or every story and then filter at the end.
- Avoid correlated subqueries in select lists, which run once per row. For a narrative's desk, use `narrativeDesks` / `deskByNarrative`.
- When a new query filters or sorts on a column, check that an index serves it (`EXPLAIN` against the dev DB, read-only). Ingest adds about 1,000 articles a day, so all-time scans slow down month by month.
- For results that are the same for every reader and change only when the pipeline runs, wrap them in `cached(key, SHARED_TTL_MS, load)` from `packages/server/src/cache.ts`. Put every parameter in the key. Tests clear the cache before each test (`test/setup.ts`). Call `clearCache()` in a test that changes data mid-test.

**Session and loaders**
- Resolve the session once per request. During SSR, `requestSession()` in `apps/web/src/server/api-bridge.ts` shares one lookup across all in-process API calls.
- Root `beforeLoad` reads the session from the query cache (`queryKeys.session()`), not the server. It runs on every navigation and every hover preload. When something stored in session info changes, invalidate that key (`savePreferencesMutation` does).
- A route loader prefetches every query its component needs, so the SSR HTML is complete and nothing pops in after hydration. Avoid `useQuery` without a matching loader prefetch, except for admin-only or below-the-fold extras.
- Don't fetch a big endpoint for a few fields. The header strip uses `/api/v1/edition`, not `/api/v1/front`.
- Queries never retry 4xx responses (`apps/web/src/router.tsx`), so a 404 shows at once.
- Story detail is the deliberate polling exception: while exact-version context is pending, its shared query refetches every 15 seconds and stops on durable completion or terminal job failure.

**Client bundle and runtime**
- `@dn/ui` is `"sideEffects": false`. Keep its modules free of side effects (no CSS imports, no top-level registration), or route chunks will merge back into the shared chunk.
- Import heavy, rarely used code dynamically where it's used, as `useSignOut` does with the auth client. Keep it out of the root layout and header imports.
- Reuse `Intl` formatters (`@dn/domain` caches them). Don't add per-component timers: relative times share `useMinuteClock`.
- Don't let a chart's height depend on a measured width, or it shifts layout after hydration.

**Measuring**
Measure against a production build, not the dev server: run `pnpm build`, then start `apps/web/server.mjs` on a spare port with `BETTER_AUTH_URL` set to that port. Compare SSR time, HTML size and the requests made on client navigation before and after. Production HTML is brotli-compressed by Cloudflare.

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
- Guard unsaved edits on cancel, route change and tab close. `DiscardGuard` (`apps/web/src/components/discard-guard.tsx`) covers route change and tab close.
- Errors say what happened and what to do next.

**State and data**
- Filters, search and pagination live in the URL. Form fields must follow the URL on back and forward (key the form on the search params). Options a field needs come from the route loader.
- A `$slug` route sets `remountDeps: ({ params }) => params`, so moving to another story, narrative or publisher starts with fresh component state (no open editor or expanded list carries over).
- Expect empty lists, missing data and bad URLs. Every list has an empty state. Never call `new URL()` unguarded in render (use `hostnameOf`). Guard maths against empty arrays.
- Format dates and times with the `@dn/domain` helpers (`Intl`-based). Relative times can differ between server and client, so pass a loader-fixed `now` or render them client-side.

**Copy**
- Write for readers, not operators. No pipeline terms (poll, backfill, embedding, outbox, CLI commands) outside `/pipeline`.
- One name per thing: **publisher** (not outlet or source), **story** (not development), **narrative**.
- Pluralise counts with `plural()`. Use "…" (not "...") and curly quotes in UI text. Button labels say exactly what happens ("Remove passkey", not "Submit").

**Motion**
- Animate only `transform`, `scale`, `opacity` and a small `filter: blur`, using the duration tokens. Those tokens drop to 0 under `prefers-reduced-motion`. Never use `transition-all`.
- Reuse the `t-*` recipes in `packages/design-tokens/motion.css` before writing new motion: `t-popup`, `t-tooltip`, `t-modal` (Base UI popups), `t-acc` (`<details>`), `t-skel`, `t-reveal` (via `useReveal` / `<Reveal>`, which skips server-rendered content), `t-pop`, `t-shimmer`, `t-shake`.

## API

All routes except the logo route require a session: the cookie from the web app, or `Authorization: Bearer <token>` from `POST /api/auth/sign-in/username` (response header `set-auth-token`). Passkeys are managed through better-auth's own `/api/auth/passkey/*` endpoints (web: `/account`).

```text
GET  /api/v1/front?region=                # lead (prefers the reader's regions), stats, developing narratives
GET  /api/v1/edition                     # header strip: editionAt + last-24h story/publisher counts
GET  /api/v1/stories?cursor=&limit=&region=
GET  /api/v1/stories/:idOrSlug          # includes summary, sources, context[], related, enrichment status (claims[] is always empty)
POST /api/v1/stories/:id/summary          # admin-only edit -> new version (ENABLE_SUMMARY_EDITING)
GET  /api/v1/narratives
GET  /api/v1/narratives/:idOrSlug
GET  /api/v1/search?q=&type=&since=&publisher=&region=
GET  /api/v1/publishers                  # publisher stats
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
GET  /api/v1/local?cursor=&limit=         # city → county/local area → country feed; request country fallback
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
- Concurrent matching coalesces very-close unmatched articles behind a durable follower lease; followers later rerun the normal conservative matcher and are never attached by the admission step.
- Published summary updates use a durable quiet-period row so bursts collapse to the latest Story fingerprint. A once-a-minute reconciler recovers expired match leases and due summary rows whose wake job was lost.
- Grounded, versioned summaries: citations are validated against the Story's own articles and observations. Edits create new versions, and stale outputs never overwrite newer ones. The same call writes 2-3 more paragraphs (background, each side, what's next) that only the Story page shows, below the one-paragraph summary.
- Narratives from Stories joined by timeline links (follows, responds to, corrects, branches from), with model-written titles. Loose links (related to, background for) show on Story pages but don't join Narratives. After upgrading, `pnpm cli enrich:all --reset-graph` rebuilds existing Narratives under this rule.
- **Context popovers:** model-written background for names and terms in a summary. Each entry must anchor to the summary's exact text and cite the Story's own articles; entries are shared across Stories and versioned. Human summary edits clear stale context; the next view regenerates it.
- **Claims:** no longer generated (November 2026): no reader has shown them since October. The `claim*` tables and their data stay for Compare Coverage (doc 009). The story detail API still returns `claims: []` and `enrichment.claims: 'ready'` for older app builds.
- **Regions:** each generated summary tags 1-3 macro-regions the Story concerns (not where outlets are based). The feed filters by region, and the lead prefers a Story in one of the reader's regions.
- **For You:** readers pick regions, desks and topics (on `/onboarding` at first sign-in or on `/account`) and follow narratives or publishers. Each generated summary tags 0-3 of 25 fixed topics (`TOPICS` in `packages/schemas`). Stories from the last 72 hours are ranked, not filtered: followed narrative +3, topic +2, followed outlet, region and desk +1 each, plus wider coverage, minus age. Every card says why it's there. Paging is an offset into the ranked window. On the web, Briefing (`/briefing`) sorts the top 30 into sections (`/for-you` redirects there); the mobile app keeps a For You tab. The front page shows the top 4 as a "For you" rail once a reader has picks, follows or learned signals. Thumbs up / down on Briefing and For You cards nudge learned weights for the Story's topics, desk, regions and narratives (never its publishers): ±1 per tap (regions ±0.5), clamped to ±3 and halved every 30 days. "Less" also hides the Story; undo reverses the tap (approximately, since weights are clamped). Readers see and reset what was learned on `/account`.
- **Blindspot (`/blindspot`):** opt-in reading history (off by default, kept 30 days, deleted when turned off). Insights are computed on request: newer Stories in narratives you read, and regions or desks with many Stories this week that you rarely read. Nothing about the reader's politics is inferred or stored. A "Covered mostly by one side" section shows even with history off: this week's Stories where at least 3 of the covering publishers in the reader's country are rated and 75% or more lean the same way.
- **Local (`/local`):** readers can explicitly save a city, county/local area and country. Story locations come from grounded summary inference and describe the event, never the publisher's headquarters. The feed shows exact city matches first, then county/local-area matches, then the rest of the country. Without a saved locality, Cloudflare's request country provides a country-only fallback and is not persisted. Existing Stories need `pnpm cli summaries:refresh --all` after the location schema is deployed.
- **Publisher assessments:** evidence is imported from open sources only: Wikidata for ownership (CC0), and Wikipedia's perennial sources list for reliability (CC BY-SA). An admin reviews it on the publisher page and publishes an append-only, versioned assessment that freezes the evidence used. Political lean is entered by hand, relative to the outlet's own country, and must cite a source such as the Reuters Institute's audience data; otherwise it shows "Not assessed".
- **Political lean on Stories:** each Story shows the reviewed lean of its newsroom publishers, one ink-only bar per country (leans aren't comparable across countries), with unrated publishers always shown as their own hatched segment. A country needs 2 rated publishers to get a bar. The reader's country comes from their `/account` setting, else Cloudflare's `CF-IPCountry` header. The publishers page shows each lean and filters by it (`?lean=`).
- **Lean evidence:** `fixtures/lean-evidence.json` holds hand-checked ratings, loaded by `assessments:import`. Neither source has an open download, so each entry is copied by hand from the source page (or the chart data behind it), with its URL and date. AllSides (CC BY-NC 4.0, attribution shown with its evidence) rates on the US scale only, so it only pre-fills US publishers. Reuters Institute DNR audience scores are relative to the outlet's own country and win over AllSides. The review form pre-fills the lean from them; an admin still publishes it. Non-commercial sources are fine for now: **re-check every source's licence before any commercial use.** MBFC (terms unclear), Ad Fontes and NewsGuard (paid) are not used.
- **Publisher coverage:** publisher stats (stories, first to report) and per-publisher pages with source-use policy, co-coverage and a coverage profile: desk and region mix against all Stories (30 days), how often an official source sits alongside it, and widely covered Stories it missed this week.
- Transactional outbox → idempotent indexer → Typesense; alias-swapped rebuild; hybrid search with automatic keyword fallback during an inference outage.
- Web: feed, Briefing, Story, Narrative (timeline), Blindspot, publishers, search, pipeline, account and onboarding pages, and a 404 page. Desktop-first and checked at 375px; below 1024px the header nav becomes a section menu.
- Auth: username/password, passkeys and optional Google sign-in (better-auth), bearer tokens for API clients; public sign-up with a username, password and optional email (web and mobile), plus self-serve account deletion on both. An `admin` role gates the Pipeline page and assessment review.
- Tests: Vitest (invariants, pipeline, API contracts) and Playwright smoke tests (desktop and mobile).

## Fixture-only or limited

- **Fixture inference** is a deterministic stand-in (bag-of-words vectors, token-overlap decisions). Its grouping is noticeably coarser than the real models'.
- **Article bodies:** 10 of 65 seeded publishers allow transient bodies (open licences or public domain, commercial use allowed). Federal Register and EU Commission pages need an API or a JS-capable fetcher, so they fall back to metadata for now. Fixture mode only has captured RSS for the original 12 publishers. The policy review was best-effort, not legal advice; get permission before production ingestion.
- **Matching thresholds** are calibrated on about 34 articles only (see doc 006).
- **Merge/split:** the data model and alias resolution exist; there is no operation or UI.
- **Ops page** is a diagnostics view for admins (`role = admin`), not an admin product.

## Deferred (per doc 005)

Full claims/evidence graph (cross-story claim linking, verification), automated political-lean ratings, Expo app, notifications, billing, Caddy/TLS, OpenTofu/Ansible.
