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
  image-up           Pull the image for the current commit, start and seed
  update-image       git pull, then the same as `image-up`
  user <username>    Create an admin login (prompts for the password)
  status             Container state and pipeline status
  logs [service]     Follow logs (all services, or one: web, worker, indexer, ...)
  cli <args...>      Run any CLI command (see AGENTS.md) inside the worker image
  backup             Dump Postgres to backups/ on the host and prune old dumps
  restore <file>     Restore a dump (asks first; takes a safety dump), then rebuild search
  down               Stop containers (data volumes are kept)
EOF
}

# Backups. Typesense is not backed up: it's rebuilt from Postgres (`cli search:rebuild`).
BACKUP_DIR=backups
BACKUP_KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
# Dumps land in backups/ on the host; copying them offsite is up to the operator.

pg() { compose exec -T postgres "$@"; }

backup() {
  mkdir -p "$BACKUP_DIR"
  local file
  file="$BACKUP_DIR/dn-$(date -u +%Y%m%dT%H%M%SZ).dump"
  # pg_dump gives a consistent snapshot while Postgres keeps running; copying the data
  # directory does not. Write to .tmp first so a failed dump never looks complete.
  # shellcheck disable=SC2016 # $POSTGRES_* expand inside the container, on purpose.
  pg sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file.tmp"
  # Reading the table of contents back catches a truncated or corrupt dump.
  pg pg_restore --list < "$file.tmp" > /dev/null
  mv "$file.tmp" "$file"
  echo "backup: $file ($(du -h "$file" | cut -f1))"
  find "$BACKUP_DIR" -name 'dn-*.dump' -mtime +"$BACKUP_KEEP_DAYS" -delete
}

restore() {
  local file="${1:-}"
  [[ -f "$file" ]] || { echo "Usage: scripts/deploy.sh restore <backups/dn-....dump>" >&2; exit 1; }
  echo "This replaces ALL data in the database with $file."
  read -rp "Type 'restore' to continue: " answer
  [[ "$answer" == "restore" ]] || { echo "Cancelled."; exit 1; }
  echo "Taking a safety dump of the current data first..."
  backup
  # Stop whatever writes, restore in one transaction, then restart only what was running
  # (locally, web may be `pnpm dev` instead of the container).
  local running
  running=$(compose ps --status running --services | grep -xE 'web|worker|indexer' || true)
  # shellcheck disable=SC2086 # word-splitting the service list is intended.
  [[ -n "$running" ]] && compose stop $running
  # shellcheck disable=SC2016 # $POSTGRES_* expand inside the container, on purpose.
  pg sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' < "$file"
  # shellcheck disable=SC2086
  [[ -n "$running" ]] && compose start $running
  cli search:rebuild
  echo "restore: done"
}

restore_image_tag() {
  local previous_image="$1"
  if [[ -n "$previous_image" ]]; then
    docker tag "$previous_image" domino-news-app:local || echo "Could not restore the previous local image tag." >&2
  elif docker image inspect domino-news-app:local > /dev/null 2>&1; then
    docker image rm domino-news-app:local || echo "Could not remove the new local image tag." >&2
  fi
}

start_image() {
  local previous_image="$1" status
  if compose up -d --wait --wait-timeout 120 --no-build --pull missing --remove-orphans; then
    :
  else
    status=$?
    echo "Deployment failed; containers or migrations may have changed. Inspect the stack before retrying." >&2
    restore_image_tag "$previous_image"
    return "$status"
  fi
  # Once started, keep the new tag even if seeding fails: containers use the new image.
  if cli seed; then
    :
  else
    status=$?
    echo "Services started, but publisher seeding failed. Retry with scripts/deploy.sh cli seed." >&2
    return "$status"
  fi
  compose ps
}

up() {
  [[ -f .env ]] || { echo "Missing .env: copy .env.example and fill it in first." >&2; exit 1; }
  local previous_image status
  previous_image=$(docker image inspect --format '{{.Id}}' domino-news-app:local 2>/dev/null) || previous_image=''
  # Every app service uses this image; building one avoids four exports to the same tag.
  if compose build web; then
    start_image "$previous_image"
  else
    status=$?
    echo "Image build failed; services were not started." >&2
    restore_image_tag "$previous_image"
    return "$status"
  fi
}

image_up() {
  [[ -f .env ]] || { echo "Missing .env: copy .env.example and fill it in first." >&2; exit 1; }
  local image previous_image
  image="${DOMINO_IMAGE_REPOSITORY:-ghcr.io/ndom91/domino-news}:$(git rev-parse HEAD)"
  echo "Pulling $image"
  # Pull before changing the local tag or starting anything: a missing image leaves the
  # currently running containers untouched. Tagging also keeps cli/backup/restore on this image.
  docker pull "$image"
  previous_image=$(docker image inspect --format '{{.Id}}' domino-news-app:local 2>/dev/null) || previous_image=''
  docker tag "$image" domino-news-app:local
  start_image "$previous_image"
}

case "${1:-}" in
  up) up ;;
  update)
    git pull --ff-only
    # Re-run the freshly pulled script; this process still holds the old functions.
    exec "$0" up
    ;;
  image-up) image_up ;;
  update-image)
    git pull --ff-only
    exec "$0" image-up
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
  backup) backup ;;
  restore) restore "${2:-}" ;;
  down) compose down ;;
  *)
    usage
    exit 1
    ;;
esac
