#!/usr/bin/env bash
# Start the dev app server. Database must already be running and reachable
# via DATABASE_URL in .env.server (monorepo: root docker-compose; OSS: bring
# your own postgres).
#
# Usage:
#   start.sh           Default — write localhost URLs into .env.client and
#                      .env.server. The Wasp app server (express, the hq server port)
#                      and dev client (Vite, the hq web port) are reachable only
#                      from this machine. OAuth providers (Google, Apple) accept
#                      these URLs as redirect URIs.
#
#   start.sh --lan     Write the machine's mDNS hostname (e.g. machine.local)
#                      into the env files instead. The Wasp client/server bundle
#                      is then reachable from any device on the same WiFi —
#                      required for mobile dev (phone hits site's API at
#                      machine.local:<hq server port>) and phone-browser site testing.
#                      OAuth redirect URIs must be re-registered with each
#                      provider for the .local hostname to use them.
#
#   start.sh --lan-ip <ip>   Same as --lan but with an explicit IPv4 override.
#                            Use when the network blocks mDNS multicast.
#
#   start.sh --tailnet Reach hq from other devices on the machine's Tailscale
#                      network (tailnet) only, over HTTPS with a tailnet
#                      certificate. Adds two tailnet-only `tailscale serve`
#                      entries (never `funnel`), leaving any others untouched:
#                        https://<machine>.<tailnet>.ts.net:<tailscale web port> -> 127.0.0.1:<hq web port> (page)
#                        https://<machine>.<tailnet>.ts.net:<tailscale server port> -> 127.0.0.1:<hq server port> (server)
#                      and writes those addresses as the bundle's API URL,
#                      WASP_SERVER_URL and WASP_WEB_CLIENT_URL. Both dev servers
#                      bind 127.0.0.1 in this mode (scripts/dev/listen-loopback.cjs),
#                      so neither is reachable from the local network. The site
#                      keeps dialling hq at its own HQ_URL (localhost) and is not
#                      exposed. Needs the Tailscale app (or `tailscale`) logged in.
#
# Note: outside --tailnet, Wasp 0.21's dev server (express + Vite) binds every
# interface. --lan controls the URLs *baked into the React bundle* and written to
# .env.server (WASP_SERVER_URL, WASP_WEB_CLIENT_URL), not the bind address.
#
# Files this script manages:
#   .env.client   — fully overwritten each run.
#   .env.server   — only WASP_SERVER_URL and WASP_WEB_CLIENT_URL are updated in
#                   place; all other keys preserved.
#                   HQ_PAIRING_SECRET is added once by ../scripts/dev/pair.sh if missing.
#                   SECRETS_MASTER_KEY is generated once by ensure-secrets-key.sh if blank.
#                   HQ_RELAY_SECRET is added the same way, and kept equal to relay/.env.server's.
#
# It also runs hq's relay (../scripts/dev/relay.sh) in the background, on its own port, for as long as hq runs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_ROOT="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$SCRIPTS_ROOT")"

# Stop if this branch is behind GitHub; install what a changed lockfile needs.
bash "$PROJECT_DIR/../scripts/dev/fresh.sh"

source "$SCRIPTS_ROOT/shared/constants.sh"

# Set one key in .env.server in place, preserving all other keys.
update_server_env() {
  local key="$1" value="$2"
  local env_file="$PROJECT_DIR/.env.server"
  if [ ! -f "$env_file" ]; then
    echo "⚠️  $env_file not found — skipping $key update" >&2
    return 0
  fi
  awk -v key="$key" -v new_val="$value" '
    index($0, key "=") == 1 { print key "=" new_val; found=1; next }
    { print }
    END { if (!found) print key "=" new_val }
  ' "$env_file" > "$env_file.tmp" && mv "$env_file.tmp" "$env_file"
}

# The Tailscale CLI: on PATH, or inside the macOS app.
tailscale_cli() {
  if command -v tailscale >/dev/null 2>&1; then
    command -v tailscale
  elif [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then
    echo /Applications/Tailscale.app/Contents/MacOS/Tailscale
  fi
}

# Argument parsing.
USE_LAN=false
USE_TAILNET=false
LAN_IP_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --lan)
      USE_LAN=true
      shift
      ;;
    --lan-ip)
      USE_LAN=true
      LAN_IP_ARG="${2:-}"
      if [ -z "$LAN_IP_ARG" ]; then
        echo "❌ --lan-ip requires an IP address argument" >&2
        exit 1
      fi
      if ! [[ "$LAN_IP_ARG" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        echo "❌ --lan-ip value '$LAN_IP_ARG' is not a valid IPv4 address" >&2
        exit 1
      fi
      shift 2
      ;;
    --tailnet)
      USE_TAILNET=true
      shift
      ;;
    *)
      echo "❌ Unknown argument: $1" >&2
      echo "   Valid: --lan | --lan-ip <ip> | --tailnet" >&2
      exit 1
      ;;
  esac
done
if [ "$USE_TAILNET" = true ] && [ "$USE_LAN" = true ]; then
  echo "❌ --tailnet cannot be combined with --lan / --lan-ip" >&2
  exit 1
fi

cd "$PROJECT_DIR"

REPO_ROOT="$(dirname "$PROJECT_DIR")"
eval "$(bash "$REPO_ROOT/scripts/dev/ports.sh")"
source "$REPO_ROOT/scripts/dev/require-free-ports.sh"
require_free_ports HQ_WEB_PORT HQ_SERVER_PORT
export HQ_WEB_PORT HQ_SERVER_PORT

echo "==> Checking agent image..."
if ! docker image inspect agenthix-agent &>/dev/null; then
  echo "==> Agent image not found — building..."
  bash "$SCRIPT_DIR/build-agent.sh"
fi

echo "==> Building the platform guide..."
node scripts/guide/build-platform-guide.mjs

echo "==> Starting app..."

# Resolve the addresses the bundle and server should advertise.
if [ "$USE_TAILNET" = true ]; then
  TS_CLI=$(tailscale_cli)
  if [ -z "$TS_CLI" ]; then
    echo "❌ --tailnet needs the Tailscale CLI (tailscale on PATH, or the Tailscale app)" >&2
    exit 1
  fi
  HOST=$("$TS_CLI" status --json | node -e '
    let s = ""
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      process.stdout.write((JSON.parse(s).Self?.DNSName ?? "").replace(/\.$/, ""))
    })')
  if [ -z "$HOST" ]; then
    echo "❌ Could not read this machine's tailnet name — is Tailscale logged in?" >&2
    exit 1
  fi
  echo "==> Tailnet name (tailnet mode): $HOST"
  # Tailnet-only HTTPS in front of each dev server. Only these two ports are set.
  "$TS_CLI" serve --bg --https=$TAILSCALE_HQ_WEB_PORT http://127.0.0.1:$HQ_WEB_PORT >/dev/null
  "$TS_CLI" serve --bg --https=$TAILSCALE_HQ_SERVER_PORT http://127.0.0.1:$HQ_SERVER_PORT >/dev/null
  CLIENT_URL="https://$HOST:$TAILSCALE_HQ_WEB_PORT"
  SERVER_URL="https://$HOST:$TAILSCALE_HQ_SERVER_PORT"
  export HQ_DEV_LISTEN_HOST=127.0.0.1
  LISTEN_PRELOAD="--require $SCRIPT_DIR/listen-loopback.cjs"
elif [ -n "$LAN_IP_ARG" ]; then
  HOST="$LAN_IP_ARG"
  echo "==> Explicit LAN IP: $HOST"
elif [ "$USE_LAN" = true ]; then
  HOST=$(get_local_hostname)
  echo "==> mDNS hostname (LAN mode): $HOST"
else
  HOST="localhost"
  echo "==> localhost (default — secure, OAuth-compatible)"
fi
CLIENT_URL="${CLIENT_URL:-http://$HOST:$HQ_WEB_PORT}"
SERVER_URL="${SERVER_URL:-http://$HOST:$HQ_SERVER_PORT}"
echo "    Frontend: $CLIENT_URL"
echo "    API:      $SERVER_URL"

# .env.client — fully overwritten. Wasp reads at dev-server start and bakes
# REACT_APP_* vars into the React bundle.
cat > "$PROJECT_DIR/.env.client" <<EOF
# Auto-generated by scripts/dev/start.sh — do not edit manually.
PORT=$HQ_WEB_PORT
REACT_APP_API_URL=$SERVER_URL
REACT_APP_CLIENT_URL=$CLIENT_URL
EOF

# .env.server — only these two keys are updated in place. All other keys
# (DATABASE_URL, API keys, SITE_ROOT, etc.) are preserved.
update_server_env WASP_SERVER_URL "$SERVER_URL"
update_server_env WASP_WEB_CLIENT_URL "$CLIENT_URL"

# hq will not start without SECRETS_MASTER_KEY (R-200): generate one if blank.
bash "$SCRIPT_DIR/ensure-secrets-key.sh"

# Make sure hq and its site share HQ_PAIRING_SECRET (see scripts/dev/pair.sh in
# the repository root). Skipped when this module is used outside the monorepo.
PAIR_SCRIPT="$PROJECT_DIR/../scripts/dev/pair.sh"
if [ -f "$PAIR_SCRIPT" ]; then
  bash "$PAIR_SCRIPT"
fi

# hq's relay (adr-0153) runs beside the dev servers and stops with them. If its port is taken (it is already
# running, say), it says so and hq starts without it.
RELAY_SCRIPT="$REPO_ROOT/scripts/dev/relay.sh"
if [ -f "$RELAY_SCRIPT" ] && [ -d "$REPO_ROOT/relay" ]; then
  bash "$RELAY_SCRIPT" &
  RELAY_PID=$!
fi

# The AI providers in the repository root's .env.dev, added once hq is up (add-providers.mjs; .env.dev.example).
if [ -f "$REPO_ROOT/.env.dev" ]; then
  node "$SCRIPT_DIR/add-providers.mjs" "$REPO_ROOT/.env.dev" &
  PROVIDERS_PID=$!
fi
trap 'kill ${RELAY_PID:-} ${PROVIDERS_PID:-} 2>/dev/null || true' EXIT

echo ""

NODE_OPTIONS="--max-old-space-size=8192${LISTEN_PRELOAD:+ $LISTEN_PRELOAD}" npx wasp start
