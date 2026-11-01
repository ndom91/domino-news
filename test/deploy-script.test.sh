#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/domino-deploy-test.XXXXXXXX")
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/scripts" "$tmp/bin"
cp "$root/scripts/deploy.sh" "$tmp/scripts/deploy.sh"
touch "$tmp/.env" "$tmp/calls"

cat > "$tmp/bin/git" <<'EOF'
#!/usr/bin/env bash
echo "git $*" >> "$CALLS"
if [[ "$1" == rev-parse ]]; then echo 0123456789abcdef0123456789abcdef01234567; fi
EOF
cat > "$tmp/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >> "$CALLS"
if [[ "$1" == pull && "${FAIL_PULL:-0}" == 1 ]]; then exit 1; fi
if [[ "$1 $2" == 'image inspect' ]]; then
  if [[ " $* " == *' --format '* && "${NO_PREVIOUS_IMAGE:-0}" == 1 ]]; then exit 1; fi
  echo sha256:previous
fi
if [[ "$1" == compose && " $* " == *' build web '* && "${FAIL_BUILD:-0}" == 1 ]]; then exit 19; fi
if [[ "$1" == compose && " $* " == *' up -d '* && "${FAIL_UP:-0}" == 1 ]]; then exit 23; fi
if [[ "$1" == compose && " $* " == *' src/cli.ts seed '* && "${FAIL_SEED:-0}" == 1 ]]; then exit 29; fi
EOF
chmod +x "$tmp/bin/git" "$tmp/bin/docker"
export PATH="$tmp/bin:$PATH" CALLS="$tmp/calls"
export DOMINO_IMAGE_REPOSITORY=ghcr.io/example/project

if FAIL_PULL=1 "$tmp/scripts/deploy.sh" image-up; then
  echo 'A failed pull must fail the deployment' >&2
  exit 1
fi
if grep -Eq '^docker (tag|compose)' "$CALLS"; then
  echo 'A failed pull must not tag or start containers' >&2
  exit 1
fi

: > "$CALLS"
if FAIL_UP=1 "$tmp/scripts/deploy.sh" image-up; then
  echo 'A failed startup must fail the deployment' >&2
  exit 1
else
  status=$?
  [[ "$status" == 23 ]] || { echo "Startup exit status was not preserved: $status" >&2; exit 1; }
fi
grep -Fx 'docker tag sha256:previous domino-news-app:local' "$CALLS" > /dev/null
if grep -F 'src/cli.ts seed' "$CALLS" > /dev/null; then
  echo 'A failed startup must not seed' >&2
  exit 1
fi

: > "$CALLS"
if FAIL_UP=1 NO_PREVIOUS_IMAGE=1 "$tmp/scripts/deploy.sh" image-up; then
  echo 'A failed first startup must fail the deployment' >&2
  exit 1
fi
grep -Fx 'docker image rm domino-news-app:local' "$CALLS" > /dev/null

: > "$CALLS"
"$tmp/scripts/deploy.sh" update-image
grep -Fx 'git pull --ff-only' "$CALLS" > /dev/null
grep -Fx 'docker pull ghcr.io/example/project:0123456789abcdef0123456789abcdef01234567' "$CALLS" > /dev/null
grep -Fx 'docker tag ghcr.io/example/project:0123456789abcdef0123456789abcdef01234567 domino-news-app:local' "$CALLS" > /dev/null
grep -F 'up -d --wait --wait-timeout 120 --no-build --pull missing --remove-orphans' "$CALLS" > /dev/null
grep -F 'run --rm worker node_modules/.bin/tsx src/cli.ts seed' "$CALLS" > /dev/null

: > "$CALLS"
"$tmp/scripts/deploy.sh" update
grep -Fx 'git pull --ff-only' "$CALLS" > /dev/null
[[ $(grep -c ' build web$' "$CALLS") == 1 ]]
grep -F 'up -d --wait --wait-timeout 120 --no-build --pull missing --remove-orphans' "$CALLS" > /dev/null
grep -F 'run --rm worker node_modules/.bin/tsx src/cli.ts seed' "$CALLS" > /dev/null
awk '/ build web$/ {build=NR} / up -d / {up=NR} / src\/cli.ts seed$/ {seed=NR} END {exit !(build && build < up && up < seed)}' "$CALLS"

: > "$CALLS"
if FAIL_BUILD=1 "$tmp/scripts/deploy.sh" up; then
  echo 'A failed build must fail the deployment' >&2
  exit 1
else
  status=$?
  [[ "$status" == 19 ]] || { echo "Build exit status was not preserved: $status" >&2; exit 1; }
fi
grep -Fx 'docker tag sha256:previous domino-news-app:local' "$CALLS" > /dev/null
if grep -Eq ' up -d | src/cli.ts seed' "$CALLS"; then
  echo 'A failed build must not start or seed services' >&2
  exit 1
fi

: > "$CALLS"
if FAIL_UP=1 "$tmp/scripts/deploy.sh" up; then
  echo 'A failed local startup must fail the deployment' >&2
  exit 1
else
  status=$?
  [[ "$status" == 23 ]] || { echo "Startup exit status was not preserved: $status" >&2; exit 1; }
fi
grep -Fx 'docker tag sha256:previous domino-news-app:local' "$CALLS" > /dev/null
if grep -F 'src/cli.ts seed' "$CALLS" > /dev/null; then
  echo 'A failed local startup must not seed' >&2
  exit 1
fi

: > "$CALLS"
if FAIL_SEED=1 "$tmp/scripts/deploy.sh" up; then
  echo 'A failed seed must fail the deployment' >&2
  exit 1
else
  status=$?
  [[ "$status" == 29 ]] || { echo "Seed exit status was not preserved: $status" >&2; exit 1; }
fi
if grep -Fx 'docker tag sha256:previous domino-news-app:local' "$CALLS" > /dev/null; then
  echo 'A failed seed must not restore the old image tag after startup' >&2
  exit 1
fi

mkdir -p "$tmp/infra/compose"
cp "$root/scripts/check-docker-workspaces.mjs" "$tmp/scripts/"
cat > "$tmp/bin/pnpm" <<'EOF'
#!/usr/bin/env bash
printf '[{"path":"%s"},{"path":"%s/apps/example"}]\n' "$WORKSPACE_ROOT" "$WORKSPACE_ROOT"
EOF
chmod +x "$tmp/bin/pnpm"
export WORKSPACE_ROOT
WORKSPACE_ROOT=$(cd "$tmp" && pwd -P)
printf 'COPY apps/example/package.json apps/example/package.json\n' > "$tmp/infra/compose/Dockerfile"
node "$tmp/scripts/check-docker-workspaces.mjs"
printf 'COPY apps/other/package.json apps/other/package.json\n' > "$tmp/infra/compose/Dockerfile"
if node "$tmp/scripts/check-docker-workspaces.mjs" > "$tmp/manifest-errors" 2>&1; then
  echo 'Workspace manifest mismatch must fail the check' >&2
  exit 1
fi
grep -F 'Missing Dockerfile workspace manifests: apps/example/package.json' "$tmp/manifest-errors" > /dev/null
grep -F 'Unexpected Dockerfile workspace manifests: apps/other/package.json' "$tmp/manifest-errors" > /dev/null
echo 'Deployment script tests passed'
