#!/usr/bin/env bash
# Make sure site/.env.server has a SECRETS_MASTER_KEY — the site's own, not hq's.
#
# The site refuses to start without it: it encrypts the site's stored credential
# to hq. A fresh copy of .env.server.example has the line blank, so a development
# start generates one, once:
#
#   - blank or missing  -> a new key (openssl rand -base64 32) is written in place.
#   - already has a value -> never replaced (changing it makes anything already
#                            encrypted unreadable). A value that is not 32 bytes
#                            of base64 is reported, not fixed.
#
# Idempotent; the key is never printed. Called by scripts/dev/pair.sh.
# Override, for testing against a copy: SITE_ENV_FILE.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${SITE_ENV_FILE:-$PROJECT_DIR/.env.server}"
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
    echo "secrets key: $KEY_NAME in $ENV_FILE is not 32 bytes of base64; the site will refuse to start." >&2
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
echo "secrets key: generated $KEY_NAME in $ENV_FILE"
