#!/usr/bin/env bash
# Builds an isolated image and checks copy-time permissions and install caching.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
probe=$(mktemp -d "$root/.docker-permissions.XXXXXXXX")
tmp=$(mktemp -d "${TMPDIR:-/tmp}/domino-permissions.XXXXXXXX")
image="domino-news-permissions-test:$$"
cleanup() {
  docker image rm "$image" > /dev/null 2>&1 || true
  rm -rf "$probe" "$tmp"
}
trap cleanup EXIT

printf 'private source\n' > "$probe/private.txt"
printf '#!/bin/sh\nexit 0\n' > "$probe/executable.sh"
chmod 700 "$probe" "$probe/executable.sh"
chmod 600 "$probe/private.txt"

docker build --progress=plain -f "$root/infra/compose/Dockerfile" -t "$image" "$root"
docker run --rm --entrypoint node "$image" -e '
  const fs = require("node:fs")
  const path = process.argv[1]
  if (process.getuid() === 0) throw Error("Image must run as a non-root user")
  fs.accessSync(`${path}/private.txt`, fs.constants.R_OK)
  fs.accessSync(`${path}/executable.sh`, fs.constants.R_OK | fs.constants.X_OK)
  if (fs.statSync(`${path}/private.txt`).mode & 0o111) throw Error("Data file became executable")
  console.log("Restrictive source permissions and executable bits handled correctly")
' "/app/$(basename "$probe")"

printf 'changed source\n' >> "$probe/private.txt"
docker build --progress=plain -f "$root/infra/compose/Dockerfile" -t "$image" "$root" > "$tmp/build.log" 2>&1
step=$(grep -E '^#[0-9]+ \[build [0-9]+/[0-9]+\] RUN .*pnpm install' "$tmp/build.log" | head -1 | cut -d' ' -f1)
if [[ -z "$step" ]] || ! grep -Fx "$step CACHED" "$tmp/build.log" > /dev/null; then
  cat "$tmp/build.log" >&2
  echo 'Dependency installation was not cached after a source-only change' >&2
  exit 1
fi
echo 'Dependency installation remained cached after a source-only change'
