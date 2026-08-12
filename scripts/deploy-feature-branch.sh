#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/mcphub}"
REPO_URL="${REPO_URL:-https://github.com/marten-lucas/mcphub.git}"
BRANCH="${BRANCH:-feature/source-install-workflow}"
STATE_DIR="${STATE_DIR:-/opt/mcphub-data}"

mkdir -p "$(dirname "$REPO_DIR")" "$STATE_DIR"

if [ ! -d "$REPO_DIR/.git" ]; then
  rm -rf "$REPO_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi

cd "$REPO_DIR"

git fetch origin "$BRANCH"

CURRENT_SHA="$(git rev-parse HEAD 2>/dev/null || true)"
REMOTE_SHA="$(git rev-parse "origin/$BRANCH")"

if [ "$CURRENT_SHA" != "$REMOTE_SHA" ]; then
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
  SHOULD_DEPLOY=true
else
  SHOULD_DEPLOY=false
fi

MCP_SETTINGS_PATH="${MCP_SETTINGS_PATH:-$STATE_DIR/mcp_settings.json}"
CUSTOM_SERVERS_PATH="${CUSTOM_SERVERS_PATH:-$STATE_DIR/custom-servers.json}"

if [ ! -f "$MCP_SETTINGS_PATH" ]; then
  cp "$REPO_DIR/mcp_settings.json" "$MCP_SETTINGS_PATH"
  SHOULD_DEPLOY=true
fi
if [ ! -f "$CUSTOM_SERVERS_PATH" ]; then
  cp "$REPO_DIR/custom-servers.json" "$CUSTOM_SERVERS_PATH"
fi

if ! docker ps --format '{{.Names}}' | grep -qx mcphub; then
  SHOULD_DEPLOY=true
fi

if [ "$SHOULD_DEPLOY" = true ]; then
  # Remove legacy container started outside compose to avoid name conflict.
  docker rm -f mcphub >/dev/null 2>&1 || true
  ENV_FILE="${REPO_DIR}/.env"
  ENV_FILE_ARG=""
  if [ -f "$ENV_FILE" ]; then
    ENV_FILE_ARG="--env-file $ENV_FILE"
  fi
  DEPLOY_BUILDS_PATH="${STATE_DIR}/deploy-builds" \
  MCP_SETTINGS_PATH="$MCP_SETTINGS_PATH" \
  CUSTOM_SERVERS_PATH="$CUSTOM_SERVERS_PATH" \
  docker compose $ENV_FILE_ARG up -d --build
  echo "Deployed commit: $(git rev-parse --short HEAD)"
else
  echo "No new commit on $BRANCH; skipping redeploy"
fi

docker compose ps
