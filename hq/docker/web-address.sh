#!/bin/sh
# hq-web's browser app is built once, with a placeholder address, and takes HQ's real address here, each time
# hq-web starts (adr-0111). The app is copied afresh from the image's own built files every time, so a restart
# with another address works, and any failure stops the start rather than serve a half-rewritten app.
set -eu
PLACEHOLDER='https://hq-address.invalid'
PLACEHOLDER_PATTERN='https://hq-address\.invalid'
TEMPLATE="${HQ_WEB_TEMPLATE:-/usr/share/hq-web}"
ROOT="${HQ_WEB_ROOT:-/srv}"

fail() {
  echo "hq-web: $*" >&2
  exit 1
}

url="${HQ_URL:-}"
[ -n "$url" ] || fail "HQ_URL is not set. Set it to the address people open HQ at, such as https://hq.example.com."
case "$url" in
  http://*|https://*) ;;
  *) fail "HQ_URL must start with http:// or https:// (got $url)." ;;
esac
case "$url" in
  */) fail "HQ_URL must not end in a slash (got $url): write it as https://hq.example.com." ;;
esac
# A host name or a bracketed IPv6 address, perhaps with a port, and nothing else: no path, and none of the
# characters that would change what the replacement below writes.
if ! printf '%s' "${url#*://}" | grep -Eq '^([A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:.]+\])(:[0-9]{1,5})?$'; then
  fail "HQ_URL is a scheme and a host, perhaps with a port, and nothing more (got $url)."
fi
port="$(printf '%s' "${url#*://}" | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p')"
if [ -n "$port" ] && { [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; }; then
  fail "HQ_URL's port must be between 1 and 65535 (got $url)."
fi
[ "$url" != "$PLACEHOLDER" ] || fail "HQ_URL is the build's placeholder, $PLACEHOLDER. Set HQ's real address."

[ -d "$TEMPLATE" ] || fail "the built app is missing from $TEMPLATE."
mkdir -p "$ROOT"
find "$ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R "$TEMPLATE"/. "$ROOT"/

files="$(grep -rlF "$PLACEHOLDER" "$ROOT" || true)"
[ -n "$files" ] || fail "the built app holds no placeholder address ($PLACEHOLDER) to replace, so it cannot be given HQ's. Rebuild the image."
# One file name per line; no globbing of the names.
set -f
IFS='
'
for f in $files; do
  sed "s#$PLACEHOLDER_PATTERN#$url#g" "$f" > "$f.address"
  cat "$f.address" > "$f"
  rm -f "$f.address"
done
unset IFS
set +f

# Any form of the placeholder left — written another way than the one replaced — would send the app nowhere.
left="$(grep -rlF 'hq-address.invalid' "$ROOT" || true)"
[ -z "$left" ] || fail "the placeholder address is still in $(printf '%s' "$left" | tr '\n' ' ')after replacing it. Rebuild the image."
echo "hq-web: the browser app reaches HQ at $url."
