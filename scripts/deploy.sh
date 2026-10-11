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
  backup             Dump Postgres to backups/, prune old dumps, push offsite with restic if configured
  restore <file>     Restore a dump (asks first; takes a safety dump), then rebuild search
  down               Stop containers (data volumes are kept)
EOF
}

# Backups. Typesense is not backed up: it's rebuilt from Postgres (`cli search:rebuild`).
BACKUP_DIR=backups
BACKUP_KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
# Optional offsite copy: put RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE (or RESTIC_PASSWORD)
# in backup.env, plus any backend credentials (e.g. AWS_ACCESS_KEY_ID for S3 or B2).
if [[ -f backup.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source backup.env
  set +a
fi

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

  if [[ -n "${RESTIC_REPOSITORY:-}" ]]; then
    command -v restic > /dev/null || { echo "restic is not installed" >&2; exit 1; }
    restic cat config > /dev/null 2>&1 || restic init
    restic backup --tag domino-news "$file"
    restic forget --tag domino-news --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
  fi
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
  backup) backup ;;
  restore) restore "${2:-}" ;;
  down) compose down ;;
  *)
    usage
    exit 1
    ;;
esac
