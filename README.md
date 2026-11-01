# Domino Wire

A news reader that shows you where every claim comes from.

It reads RSS feeds from a curated set of publishers and groups articles into **Stories**. It writes short summaries that cite their sources, then links related Stories into **Narratives** so you can follow how events unfold.

This is an early prototype.

## Run it locally

You need Node 26, pnpm (`npm install -g corepack && corepack enable`; Node 26 no longer bundles corepack), and Docker.

```bash
pnpm install
cp .env.example .env
docker compose --env-file .env -f infra/compose/compose.yaml up -d postgres typesense
pnpm db:migrate
pnpm cli seed
pnpm cli user:create --username dev --password dev-password-change-me
```

Then, in three terminals:

```bash
pnpm dev:worker
pnpm --filter @dn/worker dev:indexer
pnpm dev
```

Run `pnpm cli ingest` to pull in articles, and open http://localhost:4000.

The default setup uses fixture data and fake inference, so no GPU is needed.

## Deploy with Docker Compose

The host only needs Docker and git. `scripts/deploy.sh` wraps the Compose commands.

### Quick start

```bash
git clone <repo> && cd domino-news
cp .env.example .env
# Edit .env: BETTER_AUTH_SECRET, BETTER_AUTH_URL (public https origin), INGEST_MODE=live,
# INFERENCE_* settings, and WEB_BIND if your reverse proxy runs on another machine.
scripts/deploy.sh up            # build, migrate, start, seed publishers
scripts/deploy.sh user you      # create your login (prompts for a password)
```

The web app listens on `WEB_BIND:WEB_PORT` (default `127.0.0.1:4000`). Point your reverse proxy there.

### Updating

```bash
scripts/deploy.sh update        # git pull, cached local build, migrate, restart, re-seed
```

The Docker build caches dependency installation separately from source changes. It requires
BuildKit (enabled by default in current Docker/Compose). Web, worker, indexer and migrations
share one image, so they can all be recreated when that image changes; Postgres and Typesense
are separate images.

Alternatively, GitHub Actions publishes a multi-architecture GHCR image for each push to
`main`, tagged with its full commit SHA. Once **Publish container image** has succeeded, the
server can pull that exact image instead of building it:

```bash
scripts/deploy.sh update-image  # git pull, pull matching image, migrate, restart, re-seed
```

First make the GHCR package public or authenticate on the server with `docker login ghcr.io`
using a GitHub account/token with `read:packages` access to the package. New packages may be
private by default. For a fork, set `DOMINO_IMAGE_REPOSITORY=ghcr.io/<owner>/<repository>` in
the shell environment when running the command (lowercase). If publication has not completed
or the pull fails, the running containers are not changed; retry after the workflow succeeds.
If startup fails after the pull, the previous local image tag is restored (or removed if there
was none), but containers may already have changed and migrations are not rolled back. Inspect
the stack and database before retrying.
Use `scripts/deploy.sh image-up` to deploy the already checked-out commit without pulling git,
or `scripts/deploy.sh update` to fall back to a local build. Published images contain the
committed tree, not local uncommitted changes. Publishing is independent of the CI checks;
verify CI separately before deploying.

Data lives in Docker volumes and survives updates. Run `scripts/deploy.sh` with no arguments for the other commands (`status`, `logs`, `cli`, `backup`, `restore`, `down`).

### Backups

```bash
scripts/deploy.sh backup                        # dump Postgres to backups/, prune dumps older than 14 days
scripts/deploy.sh restore backups/dn-<time>.dump # asks first, takes a safety dump, then rebuilds search
```

- `backup` uses `pg_dump`, which is consistent while Postgres runs. Copying the data directory is not.
- Typesense isn't backed up: `restore` rebuilds it from Postgres.
- Dumps are written to `backups/` in the repo on the host. **Copying them offsite is up to you** (rsync, restic, your provider's snapshots…): a backup that only lives on the same machine doesn't survive losing it.
- **Also keep `.env` somewhere safe** (e.g. a password manager): restored data needs the same `BETTER_AUTH_SECRET`.

Nightly at 03:15, with a log:

```cron
15 3 * * * cd /opt/domino-news && scripts/deploy.sh backup >> /var/log/domino-backup.log 2>&1
```

## Learn more

- [`AGENTS.md`](AGENTS.md): commands, configuration, API, repo layout, and current status.
- [`docs/`](docs/README.md): planning and architecture.
