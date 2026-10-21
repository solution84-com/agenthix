#!/bin/sh
# hq-web's files-host step (web-files.sh, adr-0114); needs no Docker. Run from anywhere: sh hq/docker/test/web-files.test.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
STEP="$HERE/../web-files.sh"
failures=0

check() {
  if [ "$2" -eq 0 ]; then echo "passes: $1"; else echo "FAILS: $1"; failures=$((failures + 1)); fi
}

host() {
  env -i PATH="$PATH" "$@" sh "$STEP" 2>/dev/null
}

[ "$(host HQ_URL=https://hq.acme.example FILES_ORIGIN=https://files.hq.acme.example)" = 'files.hq.acme.example' ]; check "takes FILES_ORIGIN's host" $?
[ "$(host HQ_URL=https://hq.acme.example FILES_ORIGIN=https://Files.Acme-Uploads.example:8443)" = 'files.acme-uploads.example' ]; check "without its port, in lowercase" $?
[ "$(host HQ_URL=http://localhost:4100)" = 'files.localhost' ]; check "is files.localhost when HQ is on localhost" $?
[ -z "$(host HQ_URL=http://192.168.1.20:4100)" ]; check "is none on a bare network address" $?
[ -z "$(host HQ_URL=https://hq.acme.example)" ]; check "is none for a domain with no files origin set" $?
host HQ_URL=https://hq.acme.example FILES_ORIGIN=https://files.acme.example/path > /dev/null; [ $? -ne 0 ]; check "refuses a FILES_ORIGIN with a path" $?
host HQ_URL=https://hq.acme.example FILES_ORIGIN='https://x.example;evil' > /dev/null; [ $? -ne 0 ]; check "refuses one with characters a host name has not" $?
host HQ_URL=https://hq.acme.example FILES_ORIGIN=https://hq.acme.example:8443 > /dev/null; [ $? -ne 0 ]; check "refuses HQ's own host" $?

[ "$failures" -eq 0 ] && echo "all pass" || { echo "$failures failed"; exit 1; }
