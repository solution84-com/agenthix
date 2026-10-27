#!/bin/sh
# hq-web trusts a forwarded caller address only when a front door stands in
# front of it (HQ_TRUSTED_PROXIES above 1). Otherwise Caddy replaces whatever
# X-Forwarded-For a caller sent with the address it actually saw.
set -eu
# HQ's address first (adr-0111): without a valid one, hq-web does not start.
/usr/local/bin/hq-web-address
# The files host (adr-0114), on which the Caddyfile routes a ticket to hq's relay and nothing else.
# Exported only when there is one: Caddy's default for an unset FILES_HOST matches nothing, an empty one is an error.
files_host="$(/usr/local/bin/hq-web-files)"
if [ -n "$files_host" ]; then
  export FILES_HOST="$files_host"
  echo "hq-web: files are opened on $FILES_HOST."
else
  unset FILES_HOST
fi
n="${HQ_TRUSTED_PROXIES:-1}"
case "$n" in ''|*[!0-9]*) echo "HQ_TRUSTED_PROXIES must be a whole number (got '$n')" >&2; exit 1 ;; esac
if [ "$n" -gt 1 ]; then
  echo "trusted_proxies static private_ranges" > /etc/caddy/trusted-proxies.caddy
else
  : > /etc/caddy/trusted-proxies.caddy
fi
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
