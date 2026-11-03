#!/bin/sh
# hq-web's live apps' hosts step (web-previews.sh); needs no Docker. Run from anywhere: sh hq/docker/test/web-previews.test.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
STEP="$HERE/../web-previews.sh"
failures=0

check() {
  if [ "$2" -eq 0 ]; then echo "passes: $1"; else echo "FAILS: $1"; failures=$((failures + 1)); fi
}

hosts() {
  env -i PATH="$PATH" "$@" sh "$STEP" 2>/dev/null
}

[ "$(hosts 'PREVIEW_PATTERN=https://p-{id}.preview.acme.net')" = '*.preview.acme.net' ]; check "is every name directly under the preview domain" $?
[ "$(hosts 'PREVIEW_PATTERN=http://p-{id}.preview.localhost:4401')" = '*.preview.localhost' ]; check "without the port" $?
[ -z "$(hosts)" ]; check "is none with live apps off" $?
[ -z "$(hosts PREVIEW_PATTERN=)" ]; check "is none with an empty pattern" $?
hosts PREVIEW_PATTERN=https://preview.acme.net > /dev/null; [ $? -ne 0 ]; check "refuses a pattern without {id}" $?
hosts 'PREVIEW_PATTERN=https://p-{id}.acme.net/path' > /dev/null; [ $? -ne 0 ]; check "refuses one with a path" $?
hosts 'PREVIEW_PATTERN=https://p-{id}.acme.net;evil' > /dev/null; [ $? -ne 0 ]; check "refuses characters a host name has not" $?

[ "$failures" -eq 0 ] && echo "all pass" || { echo "$failures failed"; exit 1; }
