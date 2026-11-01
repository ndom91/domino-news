#!/usr/bin/env bash
# Run against a locally built app image. Creates only disposable containers and tmpfs data.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
image=${1:?Usage: bash test/compose-deploy.test.sh <local-app-image>}
tmp=$(mktemp -d "${TMPDIR:-/tmp}/domino-compose-test.XXXXXXXX")
project="dn-deploy-test-$$"
export TEST_APP_IMAGE="$image"
cat > "$tmp/.env" <<'EOF'
TYPESENSE_API_KEY=compose-test-key
EOF
cat > "$tmp/override.yaml" <<'EOF'
x-test-env: &test-env
  DATABASE_URL: postgres://dn:dn@postgres:5432/dn
  TYPESENSE_URL: http://typesense:8108
  TYPESENSE_API_KEY: compose-test-key
  BETTER_AUTH_URL: http://localhost:4000
  BETTER_AUTH_SECRET: compose-test-secret-at-least-32-characters
  INGEST_MODE: fixture
  INFERENCE_MODE: fixture
services:
  postgres:
    ports: !reset []
    volumes: !reset []
    tmpfs: [/var/lib/postgresql/data]
  typesense:
    ports: !reset []
    volumes: !reset []
    tmpfs: [/data]
  migrate:
    image: ${TEST_APP_IMAGE}
    env_file: !reset []
    environment: *test-env
    volumes: !reset []
  web:
    image: ${TEST_APP_IMAGE}
    env_file: !reset []
    environment: *test-env
    ports: !reset []
    volumes: !reset []
  worker:
    image: ${TEST_APP_IMAGE}
    env_file: !reset []
    environment: *test-env
    volumes: !reset []
  indexer:
    image: ${TEST_APP_IMAGE}
    env_file: !reset []
    environment: *test-env
    volumes: !reset []
EOF
cat > "$tmp/fail.yaml" <<'EOF'
services:
  migrate:
    command: ["/bin/sh", "-c", "exit 37"]
EOF
cat > "$tmp/fail-web.yaml" <<'EOF'
services:
  web:
    command: ["/bin/sh", "-c", "exit 42"]
    restart: "no"
EOF

compose() {
  docker compose --env-file "$tmp/.env" -f "$root/infra/compose/compose.yaml" \
    -f "$tmp/override.yaml" --profile app -p "$project" "$@"
}
cleanup() {
  compose down --remove-orphans > /dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

compose up -d --wait --wait-timeout 120 --no-build --pull missing
image_id=$(docker image inspect --format '{{.Id}}' "$image")
migration=$(compose ps -aq migrate)
finished=$(docker inspect --format '{{.State.FinishedAt}}' "$migration")
[[ $(docker inspect --format '{{.State.ExitCode}}' "$migration") == 0 ]]
[[ $(docker inspect --format '{{.Image}}' "$migration") == "$image_id" ]]
for service in web worker indexer; do
  container=$(compose ps -aq "$service")
  started=$(docker inspect --format '{{.State.StartedAt}}' "$container")
  node -e 'const [start, end] = process.argv.slice(1).map(Date.parse); if (!Number.isFinite(start) || !Number.isFinite(end) || start < end) process.exit(1)' "$started" "$finished"
  [[ $(docker inspect --format '{{.State.Running}}' "$container") == true ]]
  [[ $(docker inspect --format '{{.Image}}' "$container") == "$image_id" ]]
done
echo 'All services use one image; migration completed before the app services started'

compose down --remove-orphans
if docker compose --env-file "$tmp/.env" -f "$root/infra/compose/compose.yaml" \
  -f "$tmp/override.yaml" -f "$tmp/fail.yaml" --profile app -p "$project" \
  up -d --wait --wait-timeout 120 --no-build --pull missing; then
  echo 'A failed migration must fail the startup' >&2
  exit 1
fi
migration=$(compose ps -aq migrate)
[[ -n "$migration" ]] || { echo 'Migration container was not created' >&2; exit 1; }
migration_exit=$(docker inspect --format '{{.State.ExitCode}}' "$migration")
[[ "$migration_exit" == 37 ]] || { echo "Unexpected migration exit: $migration_exit" >&2; exit 1; }
for service in web worker indexer; do
  container=$(compose ps -aq "$service")
  if [[ -n "$container" && $(docker inspect --format '{{.State.Running}}' "$container") == true ]]; then
    echo "$service started despite a failed migration" >&2
    exit 1
  fi
done
echo 'A failed migration prevented all app services from starting'

compose down --remove-orphans
if docker compose --env-file "$tmp/.env" -f "$root/infra/compose/compose.yaml" \
  -f "$tmp/override.yaml" -f "$tmp/fail-web.yaml" --profile app -p "$project" \
  up -d --wait --wait-timeout 120 --no-build --pull missing; then
  echo 'An immediate web startup failure must fail the deployment' >&2
  exit 1
fi
web=$(compose ps -aq web)
[[ -n "$web" ]] || { echo 'Web container was not created' >&2; exit 1; }
web_exit=$(docker inspect --format '{{.State.ExitCode}}' "$web")
[[ "$web_exit" == 42 ]] || { echo "Unexpected web exit: $web_exit" >&2; exit 1; }
echo 'An immediate web startup failure was reported'
