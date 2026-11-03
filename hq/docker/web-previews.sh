#!/bin/sh
# The host names hq-web passes to hq's relay as live apps' addresses, printed for its Caddyfile's PREVIEW_HOSTS:
# `*.<preview domain>` from PREVIEW_PATTERN (`https://p-{id}.<preview domain>`), and nothing when it is unset. A
# PREVIEW_PATTERN that is not one stops the start.
set -eu

pattern="${PREVIEW_PATTERN:-}"
[ -n "$pattern" ] || { printf '\n'; exit 0; }
printf '%s' "$pattern" | grep -Eq '^https?://[a-z0-9-]*\{id\}[a-z0-9-]*(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$' || {
  echo "hq-web: PREVIEW_PATTERN is an origin with {id} in its first label, such as https://p-{id}.preview.example.com (got $pattern)." >&2
  exit 1
}
rest="${pattern#*://}"
domain="$(printf '%s' "${rest#*.}" | sed 's/:[0-9]*$//')"
printf '*.%s\n' "$domain"
