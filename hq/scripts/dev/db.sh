#!/usr/bin/env bash
# Database operations for dev environment.
# Usage: db.sh <start|migrate|studio>   (start: the dev database container; the others run through Wasp)
set -euo pipefail

PROJECT_DIR="$(dirname "$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")")"
cd "$PROJECT_DIR"

case "${1:-}" in
  start)
    # The dev database is the repository's compose service (hq-db on 127.0.0.1, HQ_DB_PORT), the one
    # DATABASE_URL in .env.server points at. `wasp db start` refuses when DATABASE_URL is set.
    REPO_ROOT="$(dirname "$PROJECT_DIR")"
    eval "$(bash "$REPO_ROOT/scripts/dev/ports.sh")"
    source "$REPO_ROOT/scripts/dev/require-free-ports.sh"
    # Only when the container is not already running: its own port is then rightly taken.
    if ! docker ps --format '{{.Names}}' | grep -qx agenthix-dev-hq-db; then require_free_ports HQ_DB_PORT; fi
    HQ_DB_PORT="$HQ_DB_PORT" docker compose -f "$PROJECT_DIR/../docker-compose.yml" up -d hq-db
    ;;
  migrate)
    NODE_OPTIONS='--max-old-space-size=8192' npx wasp db migrate-dev
    ;;
  studio)
    npx wasp db studio
    ;;
  *)
    echo "Usage: agenthix dev db <start|migrate|studio>"
    exit 1
    ;;
esac
