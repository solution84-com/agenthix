#!/usr/bin/env bash
# Pair hq with its own site in development (ADR-0042; close-out spec §6.10).
#
# hq and its site share one secret, HQ_PAIRING_SECRET, in their .env.server
# files; the site presents it to hq as its credential, so there is no
# registration and no approval for the default site. This script makes sure
# both files carry the same value:
#
#   - hq/.env.server   — gets a new secret (openssl rand -hex 32) only if it has
#                        none. An existing value is never replaced.
#   - site/.env.server — gets that same value, and HQ_URL=http://localhost:<hq server port>
#                        if it has no HQ_URL, and its own SECRETS_MASTER_KEY if it
#                        has none (site/scripts/dev/ensure-secrets-key.sh). Every
#                        other key is left as it is.
#
# hq's relay (adr-0153) shares a second secret with hq, HQ_RELAY_SECRET, in hq/.env.server and
# relay/.env.server, made and kept the same way.
#
# Idempotent: a second run changes nothing. No secret is ever printed.
# Called by hq/scripts/dev/start.sh and by the "[dev:site] Start" task.
#
# Overrides, for testing against copies: HQ_ENV_FILE, SITE_ENV_FILE, RELAY_ENV_FILE.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HQ_ENV_FILE="${HQ_ENV_FILE:-$ROOT/hq/.env.server}"
SITE_ENV_FILE="${SITE_ENV_FILE:-$ROOT/site/.env.server}"
RELAY_ENV_FILE="${RELAY_ENV_FILE:-$ROOT/relay/.env.server}"
eval "$(bash "$ROOT/scripts/dev/ports.sh")"
DEV_HQ_URL="http://localhost:$HQ_SERVER_PORT"
MIN_LENGTH=32

# Value of KEY in FILE: last assignment wins, surrounding quotes and whitespace
# removed. Prints nothing when the key is absent.
env_value() {
  local key="$1" file="$2"
  awk -v key="$key" '
    index($0, key "=") == 1 { v = substr($0, length(key) + 2) }
    END {
      gsub(/^[ \t]+|[ \t\r]+$/, "", v)
      if (v ~ /^".*"$/ || v ~ /^'"'"'.*'"'"'$/) v = substr(v, 2, length(v) - 2)
      print v
    }
  ' "$file"
}

# Set KEY to the value of environment variable VALUE_VAR in FILE, in place: the
# first KEY= line is replaced (later duplicates dropped), or the key is
# appended. The value travels in the environment, never on a command line where
# `ps` could show it. Writes through the existing file so its permissions stay.
set_env_value() {
  local key="$1" value_var="$2" file="$3" tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/pair.XXXXXX")"
  KEY="$key" VALUE="${!value_var}" awk '
    BEGIN { key = ENVIRON["KEY"]; val = ENVIRON["VALUE"] }
    index($0, key "=") == 1 { if (!done) { print key "=" val; done = 1 } ; next }
    { print }
    END { if (!done) print key "=" val }
  ' "$file" > "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

# hq and site start in parallel under "[dev] Start All" and both call this, so
# take a lock: two runs must not each generate a different secret.
LOCK="$HQ_ENV_FILE.pair.lock"
for _ in $(seq 1 100); do
  mkdir "$LOCK" 2>/dev/null && break
  sleep 0.1
done
[ -d "$LOCK" ] || { echo "pair: could not take $LOCK (remove it if no other run is active)" >&2; exit 1; }
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

if [ ! -f "$HQ_ENV_FILE" ]; then
  echo "pair: $HQ_ENV_FILE not found — copy hq/.env.server.example first. Not pairing." >&2
  exit 0
fi
if [ ! -f "$SITE_ENV_FILE" ]; then
  echo "pair: $SITE_ENV_FILE not found — copy site/.env.server.example first. Not pairing." >&2
  exit 0
fi

SECRET="$(env_value HQ_PAIRING_SECRET "$HQ_ENV_FILE")"
if [ -z "$SECRET" ]; then
  SECRET="$(openssl rand -hex 32)"
  set_env_value HQ_PAIRING_SECRET SECRET "$HQ_ENV_FILE"
  echo "pair: generated HQ_PAIRING_SECRET in hq/.env.server"
elif [ "${#SECRET}" -lt "$MIN_LENGTH" ]; then
  echo "pair: HQ_PAIRING_SECRET in $HQ_ENV_FILE is shorter than $MIN_LENGTH characters." >&2
  echo "      Replace it with a value from: openssl rand -hex 32   (or delete the line and run this again)" >&2
  exit 1
fi

if [ "$(env_value HQ_PAIRING_SECRET "$SITE_ENV_FILE")" != "$SECRET" ]; then
  set_env_value HQ_PAIRING_SECRET SECRET "$SITE_ENV_FILE"
  echo "pair: wrote HQ_PAIRING_SECRET to site/.env.server"
fi

if [ -z "$(env_value HQ_URL "$SITE_ENV_FILE")" ]; then
  set_env_value HQ_URL DEV_HQ_URL "$SITE_ENV_FILE"
  echo "pair: set HQ_URL=$DEV_HQ_URL in site/.env.server"
fi

# The site stores its credential to hq encrypted under its own key, and will
# not start without one.
SITE_ENV_FILE="$SITE_ENV_FILE" bash "$ROOT/site/scripts/dev/ensure-secrets-key.sh"

# hq's relay: one secret, the same in hq's file and the relay's. The relay's file is made when it is missing, as
# long as the relay's folder is there.
RELAY_SECRET="$(env_value HQ_RELAY_SECRET "$HQ_ENV_FILE")"
if [ -z "$RELAY_SECRET" ]; then
  RELAY_SECRET="$(openssl rand -hex 32)"
  set_env_value HQ_RELAY_SECRET RELAY_SECRET "$HQ_ENV_FILE"
  echo "pair: generated HQ_RELAY_SECRET in hq/.env.server"
elif [ "${#RELAY_SECRET}" -lt "$MIN_LENGTH" ]; then
  echo "pair: HQ_RELAY_SECRET in $HQ_ENV_FILE is shorter than $MIN_LENGTH characters." >&2
  echo "      Replace it with a value from: openssl rand -hex 32   (or delete the line and run this again)" >&2
  exit 1
fi
if [ -d "$(dirname "$RELAY_ENV_FILE")" ]; then
  [ -f "$RELAY_ENV_FILE" ] || {
    printf '# Written by scripts/dev/pair.sh, which keeps HQ_RELAY_SECRET the same as in hq/.env.server. Do not edit.\n' > "$RELAY_ENV_FILE"
    chmod 600 "$RELAY_ENV_FILE"
  }
  if [ "$(env_value HQ_RELAY_SECRET "$RELAY_ENV_FILE")" != "$RELAY_SECRET" ]; then
    set_env_value HQ_RELAY_SECRET RELAY_SECRET "$RELAY_ENV_FILE"
    echo "pair: wrote HQ_RELAY_SECRET to relay/.env.server"
  fi
fi

# In dev the site dials hq-server, which has no /relay-line: hq is told to hand hq's relay's line to sites as an
# absolute address. Left alone when already set.
if [ -z "$(env_value HQ_RELAY_LINE_URL "$HQ_ENV_FILE")" ]; then
  RELAY_LINE_URL="ws://localhost:$RELAY_SERVER_PORT/relay-line"
  set_env_value HQ_RELAY_LINE_URL RELAY_LINE_URL "$HQ_ENV_FILE"
  echo "pair: set HQ_RELAY_LINE_URL=$RELAY_LINE_URL in hq/.env.server"
fi

echo "pair: hq and its site share HQ_PAIRING_SECRET; hq and its relay share HQ_RELAY_SECRET."
