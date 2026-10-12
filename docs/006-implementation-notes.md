# 006 — Prototype Implementation Notes

**Date:** 2026-10-10
**Status:** Decisions taken while building the first vertical slice (doc 005). Short ADR-style entries; each says what was chosen and why. Revisit any of them freely.

## Workspace and tooling

| Decision | Choice | Why |
| --- | --- | --- |
| Package manager | pnpm workspaces (12.x), Node 26 (pinned in `.node-version`) | Strict, fast, good monorepo support; Node 24+ needed for `URLPattern`, `tls.setDefaultCACertificates`, `--env-file`. |
| Running TypeScript | Workspace packages export `.ts` source; Node processes run via `tsx`; the web app is bundled by Vite | No per-package build step to maintain. |
| Formatting/linting | Biome 2.5 only (2 spaces, no semicolons, single quotes) | Per doc 005. |
| Tests | Vitest (unit + integration on a real Postgres `dn_test` DB); Playwright smoke tests | Integration tests exercise the real triggers and constraints. |
| TypeScript | 7.0 (`tsc` per package via `pnpm typecheck`) | Latest stable. |

## Repository layout (deviation from doc 005 §8, as agreed)

- `packages/schemas` holds both API contracts and inference contracts (doc 004 called it `api-contracts`).
- `packages/server` was added for server-only domain services: auth, read models, story write services, outbox, search projection, the `/api/v1` router and ops. `packages/domain` stays pure and platform-neutral.
- `packages/jobs` holds the whole pipeline (ingest, embed, match, summarise, relate, backfill admission, worker runtime).
- `apps/worker` has three entry points: `worker.ts`, `indexer.ts` (separate Compose service), and `cli.ts`.
- No `packages/search` or `packages/shared`; search code lives in `packages/server/src/search`.

## Data model choices

- **IDs:** prefixed, time-sortable strings (`sty_…`, `art_…`), generated in `@dn/domain`.
- **Story publication:** `story.published_at` (null = unpublished). A Postgres trigger refuses to set it without an active `story_article`; the service layer only publishes after a grounded summary is recorded.
- **Append-only tables:** `observation`, `article_revision`, `story_summary_version` reject `UPDATE`/`DELETE` via triggers. Observation deletion for legal/privacy reasons needs `SET LOCAL dn.allow_observation_delete = 'on'`.
- **One active story per article:** partial unique index on `story_article(article_id) WHERE removed_at IS NULL`.
- **Edge direction:** `story_relationship.from_story_id` is always the *newer* Story. Temporal relations (`follows`, `branches_from`, `responds_to`, `corrects`) must point back in time and stay acyclic (`validateNewEdge`). `related_to` is stored once.
- **Summaries:** each version is immutable; `story.current_summary_id` points at the current one. Human edits are a new version with `edited_by_user_id`, and use optimistic concurrency (`basedOnVersionId` must be current, else `409 conflict`).
- **Staleness:** `story.input_fingerprint` = hash of the active articles' latest revision IDs. A generated summary is recorded only if its fingerprint is still current and differs from the current version's (so retries and stale jobs never overwrite).
- **Embeddings:** stored canonically in Postgres (`article_embedding`, `story.embedding`, pgvector 768-d) so Typesense can be rebuilt without re-embedding. Retrieval itself goes through Typesense.
- **Merge/split:** `story_lineage_event`, `story_alias` and `story.merged_into_story_id` exist and old IDs/slugs resolve, but no merge/split operation or UI is implemented yet.

## Pipeline

```text
poll_feed ──► article + revision + observation ──(same tx)──► embed_article
embed_article ──► article_embedding + outbox(article) ──► match_article (+2s)
match_article ──► attach to Story | new Story ──► build_story_summary (+5s)
build_story_summary ──► summary version + publish + outbox(story) ──► relate_story
relate_story ──► story embedding, typed edges, narrative membership
indexer: outbox ──► Typesense (re-reads Postgres; idempotent)
```

- **Queues:** pg-boss 12 with the `exclusive` policy. The singleton key is `target:fingerprint:pipelineVersion`, so duplicate in-flight work is rejected.
- **Priorities:** `interactive=20`, `fresh=10`, `backfill=0`. The embed, match and summarise queues each have a worker that only takes `priority >= fresh` (reserved slots) plus one shared slot, so backfill never uses more than one slot there. Relate runs with a single worker (see below).
- **GPU caps:** an in-process `PriorityLimiter` per model type (`EMBEDDING_CONCURRENCY`, `GENERATION_CONCURRENCY`), served interactive → fresh → backfill.
- **What gets published:** a Story is summarised, and so published, only once `MIN_PUBLISH_OUTLETS` (default 2) distinct **newsroom** publishers cover it. Official sources (agencies, regulators) attach to Stories but never count, so they can't publish alone. The gate sits in the summarise job, which every enqueue path goes through; when another outlet joins, the fingerprint changes and the next job passes. Exclusives no longer appear, so the publisher "Only source" stat was removed. Narratives are listed only with at least 4 published Stories (`MIN_NARRATIVE_STORIES` in `reader.ts`).
- **Archive items:** in live mode, feed items published more than `MAX_ARTICLE_AGE_DAYS` (default 3) ago are skipped at ingest. Some feeds (CDC) return years of history. Fixture feeds are frozen captures, so the cutoff doesn't apply to them.
- **Backfill:** articles older than `FRESH_WINDOW_HOURS` are marked `pending_backfill`. A once-a-minute producer admits `BACKFILL_ADMIT_PER_MINUTE` of them (newest first) while total queued embeddings stay under 50. Pausing stops admission (ops page or `pnpm cli backfill:pause`).
- **Matching** runs in parallel (reserved fresh slots like embed/summarise). Only the final write is serialised: it takes a Postgres advisory lock, re-checks the candidate Stories, and retries the job if a neighbour joined a Story it never evaluated, so two near-identical articles cannot both create a Story.
- **Relating** runs with concurrency 1, so graph edits do not race.
- **Retries:** 20 attempts, 10s initial, exponential, capped at 10 minutes: this rides out an inference outage of several hours. The local adapter also retries 502/503/429 twice in-call. Failed jobs stay in pg-boss and appear on the Pipeline page.
- **Transient bodies:** fetched only for publishers with `transient_body_allowed`, held in memory for one inference call, never logged or queued. Outbound links matching primary-document patterns become `source_reference` rows. Of 65 seeded publishers, **10 are `transient_body_allowed`** (Global Voices, Mongabay, Agência Pública and seven official sources under CC BY, OGL or public domain). The rest are `metadata_only` because their licences are non-commercial, unverified or block AI agents. Pages whose author metadata names AP, Reuters or AFP never yield a body. Federal Register and EU Commission pages can't be fetched as plain HTML yet, so they fall back to metadata. Reviews were best-effort, not legal advice (see `policyNote` and `license` in `fixtures/publishers.json`).

## Matching and relationship thresholds (EmbeddingGemma 2, calibrated on the fixture set)

Observed cosine similarities (title + description documents):

- Same event, different outlets: **0.78–0.90**.
- Related but distinct developments: **0.67–0.74**.
- Unrelated news: **0.60–0.66** (the floor is high).

Chosen bands (`THRESHOLDS` in `packages/jobs/src/match.ts`):

| | auto-attach | ask Gemma | new Story / no link |
| --- | --- | --- | --- |
| Article → Story (`local`) | ≥ 0.93 | 0.72–0.93 | < 0.72 |
| Story → Story relate (`local`) | — | 0.60–0.93, top 4 | < 0.60 |

The model makes nearly all matching decisions; embeddings only shortlist. Fixture mode uses separate, coarser thresholds over hashed bag-of-words vectors.

Prompt lessons from the real-model runs (current versions: `match-story@3`, `classify-relationship@3`):

- **Reactions are separate developments, in both directions.** Backfill admits newest first, so a reaction ("Trump attacks Norway over the Nobel snub") can create a Story before the event it reacts to arrives. The match prompt must say that event-vs-reaction is `related_development` regardless of order; otherwise the original event gets absorbed into the reaction Story.
- **Shared actors are not a link.** A loose relationship prompt connected anything involving Donald Trump. The prompt now requires a specific event, decision or dispute that a reader could name.
- **Known conservative miss:** "Ukraine strikes Russian fuel site after the diesel deal" is not linked to the diesel-deal Story. This is acceptable for now (the spec prefers misses over false links); revisit with a larger evaluation set before tuning further.
- Gemma sometimes answers `related` with a null relation; this is stored as `related_to`.

## Search

- Typesense collections are versioned (`stories_<ts>`) behind aliases (`stories`, `narratives`, `articles`). `pnpm cli search:rebuild` (or the ops button) builds fresh collections from Postgres and swaps the aliases.
- The indexer never trusts event payloads: it re-reads Postgres for the aggregate, so duplicates, replays and out-of-order events converge. `search_projection_state` records applied versions; withdrawn or unpublished aggregates are deleted.
- Search is hybrid (keyword + query embedding, `alpha 0.4`). Gotcha: with externally supplied vectors, `embedding` must **not** be listed in `query_by`; the vector part comes only from `vector_query`. Typesense `multi_search` returns HTTP 200 even when an individual search fails, so the client checks each result's `error` and throws (otherwise failures look like "no results"). If the embedding call fails or takes over 2.5s, it falls back to keyword-only and skips embedding for 60s (circuit breaker). Results report `mode: hybrid | keyword`.
- Typesense only returns candidate IDs and scores; result data is hydrated from Postgres. Documents therefore hold only searchable/filterable fields. Changing a collection schema (`collectionSchema` in `typesense.ts`) requires `pnpm cli search:rebuild` after deploying.
- A minimal `fetch` client replaces the Typesense SDK (five calls, simpler types).

## Web

- TanStack Start 1.168 on Vite 8; production is served by `apps/web/server.mjs` (srvx + static assets).
- **One API path for SSR and browser:** the shared `api-client` gets an isomorphic fetcher. On the server it calls `handleApiRequest` in-process with the user's cookies (no loopback HTTP); in the browser it is plain `fetch`. Loaders prefetch with the shared `@dn/queries` definitions, dehydrated via `@tanstack/react-router-ssr-query`.
- The `/api/v1` router is framework-independent (`URLPattern`), mounted by a catch-all Start server route, and contract-tested without the web app.
- Narrative membership: only timeline links (`TEMPORAL_RELATIONS`: follows, branches_from, responds_to, corrects) join Stories into a Narrative. Chains of `related_to` links pulled unrelated Stories together (an IMF growth forecast ended up in a Middle East conflict Narrative via a meetings story), so loose links stay on Story pages only. `classify-relationship@5` also requires `related_to` to name one shared event.
- Narrative timeline: one line, one marker per Story, oldest first, with date and UTC time (most Stories in a Narrative land on the same day). How Stories connect is written as text ("Responds to …", "Follows …"); `layoutNarrative` (unit-tested) picks each Story's primary link to an earlier Story. A git-graph lane layout was tried first and dropped: real Narratives opened up to six lanes for eleven Stories, which readers couldn't follow.
- Visual direction ("Signal × Index", from the Claude Design handoff, 10 Oct 2026): one font, Archivo Variable (weight and width axes) used through `type-*` role utilities; square, ruled and flat surfaces (only popovers have a shadow); signal orange is decoration only, never a button or text colour (`accent-text` for text). Bar and block colour means the Story's **desk** (politics, science, economy, culture, justice, conflict), tagged in the same summary call as regions, so every Story is coloured. A Narrative takes the desk of its latest Story and shows its title as the bar label. Colouring by Narrative was dropped: Narratives are rare (the model rightly rejects most link candidates), which left most bars grey. Stories summarised before desks existed stay neutral (slot 0) until `pnpm cli summaries:refresh` re-summarises them.
- Signature elements: the hour-cell **Source Trace** (24 cells, one mark per outlet in the hour it reported; filled = cited, ring = reported only) and the "Who reported it" **board**, whose numbers match the `[n]` markers in the summary.
- Citation numbers: the summarize prompt numbers sources in publishing order; `renumberCitations` rewrites the model's markers to cited-source order (unknown numbers are dropped) and the number is stored per `story_summary_source`, so markers and board always agree. Edited summaries keep the numbers.
- The front page is one request, `GET /api/v1/front` (stats, lead Story with its position in its Narrative, Developing narratives), so a mobile client can render it the same way.

## Playroom

- Playroom 1.4 builds with webpack. Tailwind v4 works through `postcss-loader` + `@tailwindcss/postcss`, scoped to our own `src` CSS (Playroom's internal CSS must not go through it).
- Tailwind cannot scan code typed into the Playroom editor, so `playroom/src/styles.css` keeps a small `@source inline()` safelist of layout utilities.
- Base UI popovers and tooltips work inside Playroom frames. Storybook was not needed.

## Configuration gotchas

- `NODE_EXTRA_CA_CERTS` is ignored when set through `--env-file` (Node reads it before). Use `INFERENCE_CA_CERT=/path/ca.pem` instead; the inference package registers it at runtime.
- `BETTER_AUTH_URL` must match the origin users load the app from, or sign-in fails the origin check.
- **Node 25+ no longer bundles corepack.** CI and the Dockerfile install it with `npm install -g corepack`; locally run the same once per Node version.
- **pnpm 12 in the image:** it downloads a native binary on first run and checks dependencies before every script. The Dockerfile pre-fetches the binary during the build (and gives the cache to the `node` user) and sets `pnpm_config_verify_deps_before_run=false`, since dependencies are frozen at build time. Note the `pnpm_config_` prefix; pnpm 12 ignores `npm_config_`.
- **Dependency policy:** every direct dependency is an exact version (`saveExact: true`), and pnpm only installs versions at least 7 days old (`minimumReleaseAge: 10080` minutes), including transitive ones. "Latest" therefore means the newest release older than a week. Passing an explicit range (`pnpm add foo@8`) still writes a range, so add without one or pin by hand. Upgrades: re-pin, then regenerate the lockfile so transitive packages also re-resolve under the rule.
- **Playroom uses Babel 8** (`@babel/core`, `preset-react`, `preset-typescript` pinned in `playroom/package.json`); all three must stay on the same major.
- **TypeScript 7** is the Go port: `tsc` hands off to the native `@typescript/typescript-<platform>` binary, so `pnpm typecheck` already uses it.
- Feeds are messy: entity-encoded links (BBC), tracking params (`maca`, `traffic_source`, `utm_*`), duplicate items per feed (France 24), zero-width characters. All handled in `rss.ts` / `url.ts` and covered by unit tests.

## Feature round 2 (passkeys, publishers, context, claims)

- **Passkeys:** `@better-auth/passkey`, table `auth_passkey`. `rpID` is the hostname of `BETTER_AUTH_URL` and `origin` is the URL itself, so passkeys created on one host don't work on another. Users add passkeys after a password sign-in on `/account`; login offers a button and WebAuthn autofill. Tested end-to-end with Chromium's virtual authenticator (`e2e/passkey.spec.ts`).
- **Publisher coverage** is computed at read time from `story_article` (published Stories, active links). "First to report" uses `coalesce(published_at, first_seen_at)`, so a feed with missing dates can look slower than it was. No pipeline or schema changes.
- **Enrichment after each summary version:** `build_story_summary` enqueues `relate_story`, `generate_context` and `extract_claims`, all keyed on the new summary version id, so a newer summary makes older enrichment jobs stale. `pnpm cli enrich:all` re-queues all three for existing data.
- **Context entries** (`context_entry`, `context_entry_version` (append-only), `story_context`):
  - Validation drops entries whose `anchorText` isn't verbatim in the summary or which cite observations outside the Story.
  - One interpretation per entry, so each explanation's evidence is exactly its own sources.
  - Entries are reused by `normalized_key` (slug of the title) without regeneration.
  - The reader hides anchors missing from the current text; editing a summary queues regeneration.
  - Prompt `explain-context@2` skips countries, major parties, household-name institutions, generic words and news outlets; `@1` explained "Politico" and "European Union".
- **Claims** (`claim`, `claim_mention`, `claim_evidence`):
  - Validation keeps only mentions of the Story's active articles and evidence pointing at the Story's own primary sources; claims with no mention are dropped.
  - Re-extraction sets `superseded_at` on earlier claims; nothing is edited.
  - Prompt `extract-claims@1` produced specific, attributable claims with sensible stances on the real model (e.g. Trump's "never heard of her" remark is *quoted*, the prize itself *asserted*), with zero claims dropped by validation on the fixture set.

## Feature round 3 (deployment, roles, sign-in)

- **Deployment:** `scripts/deploy.sh` wraps Compose and always passes `--env-file .env`. Without it, Compose looks for `.env` next to `compose.yaml` when substituting `${WEB_BIND}` and friends, and silently uses the defaults. `update` pulls, then re-runs the freshly pulled script. The web service binds to `WEB_BIND:WEB_PORT` (default `127.0.0.1:4000`); set `WEB_BIND` to the host's LAN address when the reverse proxy runs on another machine.
- **Admin role:** a `role` column on the user (`user` | `admin`) through better-auth `additionalFields`, not its admin plugin, which brings ban and impersonation endpoints we don't need. CLI-created accounts are admins unless `--role user`; Google accounts are users. Routes declare `adminOnly` in the API router; the web hides admin pages as a convenience only.
- **Google sign-in:** on only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. `emailAndPassword.disableSignUp` doesn't cover social providers, so any Google account can sign up (as a plain `user`). Google accounts are not linked to existing password accounts.
- **Rate-limit IPs:** better-auth keys its limiter on the client IP. Behind Cloudflare set `AUTH_IP_HEADERS=cf-connecting-ip`, but only if the origin accepts traffic from Cloudflare alone; otherwise the header can be spoofed.
- **Tooltips:** our `Tooltip` replaces the HTML `title` attribute everywhere (styled, consistent delay). Tooltips carry extra detail only; anything essential is also visible or in an accessible label.
- **Source board:** the hero shows the latest 8 reports with a "See all" link; citation markers for older reports link to the article. The Source Trace and the board share hover state, so a mark and its row highlight together.

## Political lean

- **Story lean mix** is derived on read (`packages/server/src/lean.ts`): covering newsrooms grouped by the country their lean is relative to (assessment `country_context`, else the publisher's home country). Official sources and publishers with no country are left out. No table, nothing cached.
- **Thresholds** live in `packages/domain/src/lean.ts`: a bar needs 2 rated publishers; "one-sided" needs 3 rated and 75% on one side, with centre counted as rated but on neither side.
- **Ink only:** the bar follows the publisher page's `PositionScale` and uses no colour; darker means further from centre. Party colours would read as a judgement.
- **Reader country:** `user_preference.country`, else `CF-IPCountry` (forwarded by the SSR API bridge). Cloudflare's `XX` and `T1` count as unknown. The header is never stored.
- **Lean evidence import:** AllSides blocks automated fetches (403) and sends its CSV only on request; the Reuters Institute publishes outlet audience scores only as charts, with no licence statement. Hence a hand-checked file instead of a scraper. Evidence rows carry a structured `lean` and `country_context` for the form pre-fill; assessments still freeze only source, dimension, value and URL. Methodology is now `assessment@2`.

