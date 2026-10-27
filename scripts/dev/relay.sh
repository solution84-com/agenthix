#!/usr/bin/env bash
# Run hq's relay (adr-0153) in development: the process that carries a file's bytes between a browser and the site
# that holds it. It listens on the relay's port (core/src/ports/ports.ts) on this machine only; hq's dev server
# (Vite) sends it a ticket's path and the line sites dial (hq/vite.config.ts). Started by hq/scripts/dev/start.sh.
#
# It takes HQ_RELAY_SECRET from relay/.env.server, which scripts/dev/pair.sh keeps equal to hq's, and dials hq-server
# on this machine. HQ_URL and FILES_ORIGIN are read from hq/.env.server (HQ's address as the browser opens it, and
# the files address where hq has one). It reads hq's uploads (task attachments, pictures) from hq's storage folder,
# the same one hq-server writes: HQ_STORAGE_ROOT from the environment or hq/.env.server, else hq/storage, which is
# where hq's own fallback is. Nothing is printed of the secret.
#
# Usage: relay.sh          builds it, then runs it in the foreground
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HQ_ENV_FILE="${HQ_ENV_FILE:-$ROOT/hq/.env.server}"
RELAY_ENV_FILE="${RELAY_ENV_FILE:-$ROOT/relay/.env.server}"
eval "$(bash "$ROOT/scripts/dev/ports.sh")"
source "$ROOT/scripts/dev/require-free-ports.sh"

# Value of KEY in FILE: last assignment wins, surrounding quotes removed; nothing when absent.
env_value() {
  [ -f "$2" ] || return 0
  awk -v key="$1" '
    index($0, key "=") == 1 { v = substr($0, length(key) + 2) }
    END {
      gsub(/^[ \t]+|[ \t\r]+$/, "", v)
      if (v ~ /^".*"$/ || v ~ /^'"'"'.*'"'"'$/) v = substr(v, 2, length(v) - 2)
      print v
    }
  ' "$2"
}

[ -f "$RELAY_ENV_FILE" ] || bash "$ROOT/scripts/dev/pair.sh"
secret="$(env_value HQ_RELAY_SECRET "$RELAY_ENV_FILE")"
if [ "${#secret}" -lt 32 ]; then
  echo "Refusing to start the relay: HQ_RELAY_SECRET in $RELAY_ENV_FILE is missing or shorter than 32 characters. Run scripts/dev/pair.sh, which sets it. Nothing was started." >&2
  exit 1
fi

REQUIRE_FREE_PORTS_HINT=RELAY_SERVER_PORT
require_free_ports RELAY_SERVER_PORT

export HQ_RELAY_SECRET="$secret"
export RELAY_HQ_ADDRESS="http://localhost:$HQ_SERVER_PORT"
export HQ_URL="$(env_value WASP_WEB_CLIENT_URL "$HQ_ENV_FILE")"
[ -n "$HQ_URL" ] || HQ_URL="http://localhost:$HQ_WEB_PORT"
export FILES_ORIGIN="$(env_value FILES_ORIGIN "$HQ_ENV_FILE")"
storage_root="${HQ_STORAGE_ROOT:-$(env_value HQ_STORAGE_ROOT "$HQ_ENV_FILE")}"
[ -n "$storage_root" ] || storage_root="$ROOT/hq/storage"
case "$storage_root" in "~/"*) storage_root="$HOME/${storage_root#\~/}" ;; esac
export HQ_UPLOADS_ROOT="$storage_root"
export RELAY_PORT="$RELAY_SERVER_PORT"

cd "$ROOT/relay"
[ -d node_modules ] || npm ci --no-audit --no-fund
(cd "$ROOT/core" && [ -d dist ] || npm run build)
npm run build
exec node --enable-source-maps dist/relay.js
