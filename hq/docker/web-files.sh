#!/bin/sh
# The host name hq-web answers uploaded files on (adr-0114), printed for its Caddyfile's FILES_HOST: FILES_ORIGIN's
# host when it is set, files.localhost when HQ is on localhost, and nothing otherwise — then hq-server serves
# uploads from HQ's own address, as downloads only. A FILES_ORIGIN that is not an origin stops the start.
set -eu

fail() {
  echo "hq-web: $*" >&2
  exit 1
}

host_of() {
  printf '%s' "${1#*://}" | sed 's/:[0-9]*$//' | tr 'A-Z' 'a-z'
}

origin="${FILES_ORIGIN:-}"
if [ -n "$origin" ]; then
  printf '%s' "$origin" | grep -Eq '^https?://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?$' \
    || fail "FILES_ORIGIN is a scheme and a host name, perhaps with a port, and nothing more (got $origin)."
  host="$(host_of "$origin")"
  [ "$host" != "$(host_of "${HQ_URL:-}")" ] || fail "FILES_ORIGIN must be a host of its own, not HQ's ($origin)."
  printf '%s\n' "$host"
  exit 0
fi
case "$(host_of "${HQ_URL:-}")" in
  localhost|*.localhost) printf 'files.localhost\n' ;;
  *) printf '\n' ;;
esac
