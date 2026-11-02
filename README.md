<h1><img src="apps/web/public/icon-512.png" alt="" width="80" align="middle"> Domino Wire</h1>

A news reader that brings reporting from different publishers together, with citations back to the articles behind each summary.

It reads RSS feeds from a curated set of publishers and groups articles into **Stories**. It writes short summaries that cite their sources, then links related Stories into **Narratives** so you can follow how events unfold.

Compare how publishers cover a story, see their assessed political lean by country, and follow a timeline of what changed. Explore a personalised feed and audio briefing, or use Blindspot to find coverage you may have missed.

![Domino Wire: follow the news across publishers, understand the context, and see what you might have missed](apps/web/public/og-domino-wire.png)

## Try the mobile app

<a href="https://play.google.com/apps/testing/dev.ndo.dominonews"><img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Join the Android beta on Google Play" height="40"></a>
<a href="https://testflight.apple.com/join/hTE68EBm"><img src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg" alt="Join the iOS beta on TestFlight" height="40"></a>

For Android, first join the [Domino News Testers Google group](https://groups.google.com/u/1/g/domino-news-testers), then open the Google Play testing invite. The iOS link opens the TestFlight invite.

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
