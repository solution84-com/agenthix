#!/usr/bin/env bash
# Make sure hq/.env.server has a SECRETS_MASTER_KEY (R-200).
#
# hq refuses to start without it: it encrypts hq's signing key and every stored
# provider key and model credential. A fresh copy of .env.server.example has the
# line blank, so a development start generates one, once:
#
#   - blank or missing  -> a new key (openssl rand -base64 32) is written in place.
#   - already has a value -> never replaced (changing it makes anything already
#                            encrypted unreadable). A value that is not 32 bytes
#                            of base64 is reported, not fixed.
#
# Idempotent; the key is never printed. Called by hq/scripts/dev/start.sh.
# Override, for testing against a copy: HQ_ENV_FILE.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${HQ_ENV_FILE:-$PROJECT_DIR/.env.server}"
KEY_NAME="SECRETS_MASTER_KEY"

if [ ! -f "$ENV_FILE" ]; then
  echo "secrets key: $ENV_FILE not found — copy .env.server.example first. Not generating $KEY_NAME." >&2
  exit 0
fi

# Value of the key: last assignment wins, surrounding quotes and whitespace removed.
current="$(awk -v key="$KEY_NAME" '
  index($0, key "=") == 1 { v = substr($0, length(key) + 2) }
  END {
    gsub(/^[ \t]+|[ \t\r]+$/, "", v)
    if (v ~ /^".*"$/ || v ~ /^'"'"'.*'"'"'$/) v = substr(v, 2, length(v) - 2)
    print v
  }
' "$ENV_FILE")"

if [ -n "$current" ]; then
  if [ "$(printf '%s' "$current" | openssl base64 -d -A 2>/dev/null | wc -c | tr -d ' ')" != "32" ]; then
    echo "secrets key: $KEY_NAME in $ENV_FILE is not 32 bytes of base64; hq will refuse to start." >&2
    echo "             Replace it with a value from: openssl rand -base64 32" >&2
    exit 1
  fi
  exit 0
fi

new_key="$(openssl rand -base64 32)"
tmp="$(mktemp "${TMPDIR:-/tmp}/secrets-key.XXXXXX")"
# The value travels in the environment, never on a command line where `ps` could show it.
KEY="$KEY_NAME" VALUE="$new_key" awk '
  BEGIN { key = ENVIRON["KEY"]; val = ENVIRON["VALUE"] }
  index($0, key "=") == 1 { if (!done) { print key "=" val; done = 1 } ; next }
  { print }
  END { if (!done) print key "=" val }
' "$ENV_FILE" > "$tmp"
# Write through the existing file so its permissions stay.
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
echo "secrets key: generated $KEY_NAME in .env.server"
