#!/usr/bin/env bash
# Central naming constants — source this in any script that references container or image names.
# Sourced by other scripts — not run directly.

# ── Docker images (same tag for local and VPS) ────────────────────────────────
export SERVER_IMAGE="agenthix-site-server"
export CLIENT_IMAGE="agenthix-site-client"
export AGENT_IMAGE="agenthix-agent"
export EXECUTOR_IMAGE="agenthix-executor"

# ── Local stack ───────────────────────────────────────────────────────────────
export LOCAL_SERVER_CONTAINER="agenthix-local-hq-server"
export LOCAL_CLIENT_CONTAINER="agenthix-local-hq-client"
export LOCAL_DB_CONTAINER="agenthix-local-hq-db"
export LOCAL_AGENT_PREFIX="agenthix-local-agent"
export LOCAL_CONTAINER_FILTER="agenthix-local-hq"

# ── Network helpers ───────────────────────────────────────────────────────────
# Returns the machine's mDNS hostname (e.g. machine.local). Resolves to 127.0.0.1
# from the host itself and to the LAN IP from any other device on the same WiFi.
# Stable across networks, works offline, no IP detection needed.
get_local_hostname() {
  if command -v scutil >/dev/null 2>&1; then
    echo "$(scutil --get LocalHostName).local"
  else
    echo "$(hostname -s 2>/dev/null || hostname).local"
  fi
}

# Returns the machine's LAN IP (en0 first, en1 fallback). Empty string if none found.
# Kept for explicit --lan-ip overrides on networks that block mDNS multicast.
get_lan_ip() {
  ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
}
