<table>
  <tr>
    <td><img src="apps/web/public/icon-512.png" alt="" width="80"></td>
    <td valign="middle"><h1>Domino Wire</h1></td>
  </tr>
</table>

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

```bash
git clone <repo> && cd domino-news
cp .env.example .env
# Edit .env: BETTER_AUTH_SECRET, BETTER_AUTH_URL (public https origin), INGEST_MODE=live,
# INFERENCE_* settings, and WEB_BIND if your reverse proxy runs on another machine.
scripts/deploy.sh up            # build, migrate, start, seed publishers
scripts/deploy.sh user you      # create your login (prompts for a password)
```

The web app listens on `WEB_BIND:WEB_PORT` (default `127.0.0.1:4000`). Point your reverse proxy there. See the [operations guide](AGENTS.md#operations) for updates, backups and recovery.

## Learn more

- [`AGENTS.md`](AGENTS.md): commands, configuration, API, repo layout, and current status.
- [`docs/`](docs/README.md): planning and architecture.
- [`LICENSE`](LICENSE) and [`NOTICE.md`](NOTICE.md): code licence and third-party data terms.
