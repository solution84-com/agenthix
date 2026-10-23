#!/usr/bin/env bash
# Try a fresh HQ in development: start the dev hq and its dev site against
# separate, empty databases and storage folders, without touching the normal dev
# databases, the normal dev files or the .env.server files (DATABASE_URL,
# HQ_STORAGE_ROOT and SITE_ROOT are overridden for this run only).
#
# Usage:
#   fresh.sh             Create the fresh databases if missing, migrate them, start both apps.
#   fresh.sh --reset     Drop and recreate both fresh databases, and empty the fresh
#                        storage folders, so the first-admin flow can be run again.
#   fresh.sh --dry-run   Print the databases and steps; start nothing, change nothing.
#
# Needs the dev databases up (docker compose up -d) and the normal dev apps stopped (the ports of
# core/src/ports/ports.ts, as scripts/dev/ports.sh prints them, free).
# HQ prints the first-admin link in its log on a fresh HQ: look for the
# line "No admin yet. Open this link to set up..." in this terminal's output.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HQ_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
SITE_DIR="$(dirname "$HQ_DIR")/site"

REPO_ROOT="$(dirname "$HQ_DIR")"
eval "$(bash "$REPO_ROOT/scripts/dev/ports.sh")"
source "$REPO_ROOT/scripts/dev/require-free-ports.sh"
HQ_DB_PORT="${FRESH_HQ_DB_PORT:-$HQ_DB_PORT}"
SITE_DB_PORT="${FRESH_SITE_DB_PORT:-$SITE_DB_PORT}"
HQ_DB_NAME=agenthix_fresh
SITE_DB_NAME=agenthix_site_fresh
HQ_DB_CONTAINER=agenthix-dev-hq-db
SITE_DB_CONTAINER=agenthix-dev-site-db
# The dev databases' own credentials, from the root docker-compose.yml.
HQ_DATABASE_URL="postgresql://agenthix:agenthix@localhost:$HQ_DB_PORT/$HQ_DB_NAME"
SITE_DATABASE_URL="postgresql://agenthix:agenthix@localhost:$SITE_DB_PORT/$SITE_DB_NAME"
# HQ's own files (images, its log) and the site's data, apart from the normal dev HQ's and site's.
FRESH_DIR="${FRESH_STORAGE_DIR:-$HOME/.agenthix.dev-fresh}"
HQ_STORAGE="$FRESH_DIR/hq"
SITE_STORAGE="$FRESH_DIR/site"

RESET=false
DRY=false
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=true ;;
    --dry-run) DRY=true ;;
    *) echo "Unknown argument: $arg (valid: --reset | --dry-run)" >&2; exit 1 ;;
  esac
done

if [ -n "${FRESH_PORTS:-}" ]; then
  REQUIRE_FREE_PORTS_HINT=FRESH_PORTS require_free_ports $FRESH_PORTS
else
  require_free_ports HQ_WEB_PORT HQ_SERVER_PORT SITE_SERVER_PORT
fi

if [ "$DRY" = true ]; then
  echo "hq database:   $HQ_DB_NAME on port $HQ_DB_PORT"
  echo "site database: $SITE_DB_NAME on port $SITE_DB_PORT"
  echo "storage:       $FRESH_DIR"
  [ "$RESET" = true ] && echo "would drop and recreate both, and empty $FRESH_DIR"
  echo "would create missing, migrate, then start the site and hq"
  exit 0
fi

# Run psql inside the dev database container: no local client needed.
psql_in() { docker exec "$1" psql -U agenthix -d postgres -qtAc "$2"; }

ensure_db() {
  local container="$1" name="$2"
  if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
    echo "The dev database container $container is not running (docker compose up -d)." >&2
    exit 1
  fi
  if [ "$RESET" = true ]; then
    psql_in "$container" "DROP DATABASE IF EXISTS $name WITH (FORCE)" >/dev/null
  fi
  if [ -z "$(psql_in "$container" "SELECT 1 FROM pg_database WHERE datname = '$name'")" ]; then
    psql_in "$container" "CREATE DATABASE $name" >/dev/null
    echo "==> Created $name"
  fi
}

ensure_db "$HQ_DB_CONTAINER" "$HQ_DB_NAME"
[ "$RESET" = true ] && rm -rf "$HQ_STORAGE" "$SITE_STORAGE"
mkdir -p "$HQ_STORAGE" "$SITE_STORAGE"
ensure_db "$SITE_DB_CONTAINER" "$SITE_DB_NAME"

echo "==> Migrating $SITE_DB_NAME"
(cd "$SITE_DIR" && DATABASE_URL="$SITE_DATABASE_URL" npm run db:deploy)
echo "==> Migrating $HQ_DB_NAME"
(cd "$HQ_DIR" && DATABASE_URL="$HQ_DATABASE_URL" npx wasp db migrate-dev)

echo "==> Starting the site against $SITE_DB_NAME"
(cd "$SITE_DIR" && DATABASE_URL="$SITE_DATABASE_URL" SITE_ROOT="$SITE_STORAGE" npm run dev) &
SITE_PID=$!
trap 'kill "$SITE_PID" 2>/dev/null || true' EXIT INT TERM

echo "==> Starting hq against $HQ_DB_NAME. Look for the line \"No admin yet. Open this link\" below: the first-admin link."
DATABASE_URL="$HQ_DATABASE_URL" HQ_STORAGE_ROOT="$HQ_STORAGE" bash "$SCRIPT_DIR/start.sh"
