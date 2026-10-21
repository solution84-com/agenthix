#!/bin/sh
# hq-web's start-time address step (web-address.sh, adr-0111), against a stand-in for the built app; needs no
# Docker. Run from anywhere: sh hq/docker/test/web-address.test.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
STEP="$HERE/../web-address.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
failures=0

check() {
  if [ "$2" -eq 0 ]; then echo "passes: $1"; else echo "FAILS: $1"; failures=$((failures + 1)); fi
}

built() {
  rm -rf "$WORK/template" "$WORK/srv"
  mkdir -p "$WORK/template/assets"
  printf '<!doctype html><script type="module" src="/assets/index-1.js"></script>\n' > "$WORK/template/200.html"
  printf 'const config={apiUrl:"https://hq-address.invalid"};fetch("https://hq-address.invalid/auth/me")\n' > "$WORK/template/assets/index-1.js"
  printf '{"sources":["x"],"mappings":"","file":"https://hq-address.invalid"}\n' > "$WORK/template/assets/index-1.js.map"
  printf 'body{color:inherit}\n' > "$WORK/template/assets/index-1.css"
}

start() {
  env -i PATH="$PATH" HQ_WEB_TEMPLATE="$WORK/template" HQ_WEB_ROOT="$WORK/srv" "$@" sh "$STEP" > "$WORK/out" 2>&1
}

built
start HQ_URL=https://hq.acme.example; check "starts with an https address" $?
grep -q 'apiUrl:"https://hq.acme.example"' "$WORK/srv/assets/index-1.js" \
  && grep -q 'fetch("https://hq.acme.example/auth/me")' "$WORK/srv/assets/index-1.js"; check "puts the address in the built app" $?
! grep -rq 'hq-address.invalid' "$WORK/srv"; check "leaves no placeholder" $?
grep -q 'hq-address.invalid' "$WORK/template/assets/index-1.js"; check "keeps the image's own built app as it was" $?
cmp -s "$WORK/template/assets/index-1.css" "$WORK/srv/assets/index-1.css"; check "copies files without the placeholder unchanged" $?

start HQ_URL=http://192.168.1.20:4100; check "starts again with another address" $?
grep -q 'apiUrl:"http://192.168.1.20:4100"' "$WORK/srv/assets/index-1.js" \
  && ! grep -q 'hq.acme.example' "$WORK/srv/assets/index-1.js"; check "takes the new address, not the last one" $?

start HQ_URL='http://[::1]:4100'; check "takes a bracketed IPv6 address" $?
start HQ_URL=http://localhost:4100; check "takes localhost with a port" $?

start; [ $? -ne 0 ] && grep -q 'HQ_URL is not set' "$WORK/out"; check "refuses to start without HQ_URL" $?
start HQ_URL=; [ $? -ne 0 ] && grep -q 'HQ_URL is not set' "$WORK/out"; check "refuses an empty HQ_URL" $?
for bad in hq.acme.example ftp://hq.acme.example https://hq.acme.example/ https://hq.acme.example/hq \
  'https://hq.acme.example#x' 'https://hq&x' 'https://hq.acme.example:99999' 'https://a b' 'https://hq\x' 'https://-hq'; do
  start HQ_URL="$bad"; [ $? -ne 0 ]; check "refuses the malformed address $bad" $?
done
start HQ_URL=https://hq-address.invalid; [ $? -ne 0 ] && grep -q "placeholder" "$WORK/out"; check "refuses the placeholder itself as the address" $?

built
start HQ_URL=https://hq.acme.example
before="$(cat "$WORK/srv/assets/index-1.js")"
start HQ_URL=https://hq.acme.example/; [ $? -ne 0 ]; check "refuses a malformed address on a restart" $?
[ "$(cat "$WORK/srv/assets/index-1.js")" = "$before" ]; check "and leaves the app it last served untouched" $?

built
printf 'nothing to replace\n' > "$WORK/template/assets/index-1.js"; rm "$WORK/template/assets/index-1.js.map"
start HQ_URL=https://hq.acme.example; [ $? -ne 0 ] && grep -q 'no placeholder' "$WORK/out"; check "refuses to start when the built app holds no placeholder" $?

built
printf 'const a="https:\\/\\/hq-address.invalid"\n' >> "$WORK/template/assets/index-1.js"
start HQ_URL=https://hq.acme.example; [ $? -ne 0 ] && grep -q 'still in' "$WORK/out"; check "refuses to start when a placeholder written another way is left" $?

rm -rf "$WORK/template"
start HQ_URL=https://hq.acme.example; [ $? -ne 0 ] && grep -q 'missing' "$WORK/out"; check "refuses to start without the built app" $?

[ "$failures" -eq 0 ] && echo "all pass" || { echo "$failures failed"; exit 1; }
