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
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

MCP_SETTINGS_PATH="${MCP_SETTINGS_PATH:-$STATE_DIR/mcp_settings.json}"
CUSTOM_SERVERS_PATH="${CUSTOM_SERVERS_PATH:-$STATE_DIR/custom-servers.json}"

if [ ! -f "$MCP_SETTINGS_PATH" ]; then
  cp "$REPO_DIR/mcp_settings.json" "$MCP_SETTINGS_PATH"
fi
if [ ! -f "$CUSTOM_SERVERS_PATH" ]; then
  cp "$REPO_DIR/custom-servers.json" "$CUSTOM_SERVERS_PATH"
fi

# Remove legacy container started outside compose to avoid name conflict.
docker rm -f mcphub >/dev/null 2>&1 || true

MCP_SETTINGS_PATH="$MCP_SETTINGS_PATH" CUSTOM_SERVERS_PATH="$CUSTOM_SERVERS_PATH" docker compose up -d --build

echo "Deployed commit: $(git rev-parse --short HEAD)"
docker compose ps
