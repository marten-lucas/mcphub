#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/mcphub}"
REPO_URL="${REPO_URL:-https://github.com/marten-lucas/mcphub.git}"
BRANCH="${BRANCH:-feature/source-install-workflow}"

mkdir -p "$(dirname "$REPO_DIR")"

if [ ! -d "$REPO_DIR/.git" ]; then
  rm -rf "$REPO_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi

cd "$REPO_DIR"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

# Remove legacy container started outside compose to avoid name conflict.
docker rm -f mcphub >/dev/null 2>&1 || true

docker compose up -d --build

echo "Deployed commit: $(git rev-parse --short HEAD)"
docker compose ps
