#!/usr/bin/env bash
# Docker Compose deployment helper. Needs only Docker and git on the host (no Node).
set -euo pipefail

cd "$(dirname "$0")/.."
# --env-file: Compose otherwise looks for .env next to compose.yaml when substituting
# ${WEB_BIND}, ${TYPESENSE_API_KEY} etc.; env_file only feeds the containers.
compose() { docker compose --env-file .env -f infra/compose/compose.yaml --profile app "$@"; }
cli() { compose run --rm worker node_modules/.bin/tsx src/cli.ts "$@"; }

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh <command>

  up                 Build images, start everything (migrations run first), seed publishers
  update             git pull, then the same as `up`
  user <username>    Create an admin login (prompts for the password)
  status             Container state and pipeline status
  logs [service]     Follow logs (all services, or one: web, worker, indexer, ...)
  cli <args...>      Run any CLI command (see AGENTS.md) inside the worker image
  down               Stop containers (data volumes are kept)
EOF
}

up() {
  [[ -f .env ]] || { echo "Missing .env: copy .env.example and fill it in first." >&2; exit 1; }
  compose up -d --build --remove-orphans
  # Upsert, so it's safe on every run and picks up new publishers after an update.
  cli seed
  compose ps
}

case "${1:-}" in
  up) up ;;
  update)
    git pull --ff-only
    # Re-run the freshly pulled script; this process still holds the old functions.
    exec "$0" up
    ;;
  user)
    [[ -n "${2:-}" ]] || { usage; exit 1; }
    read -rsp "Password for $2 (min 10 chars): " password
    echo
    cli user:create --username "$2" --password "$password"
    ;;
  status)
    compose ps
    cli status
    ;;
  logs)
    shift
    compose logs -f --tail=100 "$@"
    ;;
  cli)
    shift
    cli "$@"
    ;;
  down) compose down ;;
  *)
    usage
    exit 1
    ;;
esac
