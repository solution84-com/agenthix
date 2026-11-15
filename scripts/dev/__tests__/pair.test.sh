#!/usr/bin/env bash
# Checks scripts/dev/pair.sh against temporary copies of the env files — never
# the real ones. Run: bash scripts/dev/__tests__/pair.test.sh
set -uo pipefail

PAIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/pair.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/pair-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
export HQ_ENV_FILE="$WORK/hq.env" SITE_ENV_FILE="$WORK/site.env" RELAY_ENV_FILE="$WORK/relay.env"
FAILS=0

check() { # description, condition-exit-code
  if [ "$2" -eq 0 ]; then echo "  ok   $1"; else echo "  FAIL $1"; FAILS=$((FAILS + 1)); fi
}
val() { awk -v k="$1" 'index($0, k "=") == 1 { print substr($0, length(k) + 2) }' "$2"; }

printf 'PORT=4101\nDATABASE_URL=postgresql://u:p@localhost:4109/db\nWASP_SERVER_URL=http://localhost:4101\n' > "$HQ_ENV_FILE"
printf '# site\nPORT=4201\nSITE_ROOT=~/.agenthix.dev\nHQ_URL=\n' > "$SITE_ENV_FILE"
chmod 640 "$HQ_ENV_FILE"

echo "first run"
OUT1="$(bash "$PAIR" 2>&1)"; check "exits 0" $?
S1="$(val HQ_PAIRING_SECRET "$HQ_ENV_FILE")"
[ "${#S1}" -eq 64 ] && [[ "$S1" =~ ^[0-9a-f]+$ ]]; check "hq gets a 64-hex-character secret" $?
[ "$(val HQ_PAIRING_SECRET "$SITE_ENV_FILE")" = "$S1" ]; check "site carries the same value" $?
[ "$(val HQ_URL "$SITE_ENV_FILE")" = "http://localhost:4101" ]; check "empty HQ_URL is filled in" $?
[ "$(val DATABASE_URL "$HQ_ENV_FILE")" = "postgresql://u:p@localhost:4109/db" ] && [ "$(val SITE_ROOT "$SITE_ENV_FILE")" = "~/.agenthix.dev" ]; check "other keys preserved" $?
grep -q '^# site$' "$SITE_ENV_FILE"; check "comments preserved" $?
[[ "$OUT1" != *"$S1"* ]]; check "the secret is not printed" $?
K1="$(val SECRETS_MASTER_KEY "$SITE_ENV_FILE")"
[ "$(printf '%s' "$K1" | openssl base64 -d -A | wc -c | tr -d ' ')" = "32" ]; check "site gets its own 32-byte SECRETS_MASTER_KEY" $?
[ -z "$(val SECRETS_MASTER_KEY "$HQ_ENV_FILE")" ]; check "hq's file is not given the site's key" $?
[[ "$OUT1" != *"$K1"* ]]; check "the site key is not printed" $?
[ "$(stat -f %Lp "$HQ_ENV_FILE" 2>/dev/null || stat -c %a "$HQ_ENV_FILE")" = "640" ]; check "file permissions preserved" $?
[ "$(val HQ_RELAY_LINE_URL "$HQ_ENV_FILE")" = "ws://localhost:4401/relay-line" ]; check "hq is given the relay's line address for dev" $?
[ -z "$(val HQ_RELAY_LINE_URL "$SITE_ENV_FILE")" ]; check "the site is not given it" $?

S1R="$(val HQ_RELAY_SECRET "$HQ_ENV_FILE")"
[ "${#S1R}" -eq 64 ] && [[ "$S1R" =~ ^[0-9a-f]+$ ]]; check "hq gets a 64-hex-character relay secret" $?
[ "$(val HQ_RELAY_SECRET "$RELAY_ENV_FILE")" = "$S1R" ]; check "hq's relay carries the same value, in a file it is made" $?
head -1 "$RELAY_ENV_FILE" | grep -q "^# Written by scripts/dev/pair.sh"; check "the relay's file it makes says who writes it" $?
[ "$S1R" != "$S1" ]; check "the relay's secret is not the pairing secret" $?
[ -z "$(val HQ_RELAY_SECRET "$SITE_ENV_FILE")" ]; check "the site is not given the relay's secret" $?
[[ "$OUT1" != *"$S1R"* ]]; check "the relay secret is not printed" $?

echo "second run"
cp "$HQ_ENV_FILE" "$WORK/hq.before"; cp "$SITE_ENV_FILE" "$WORK/site.before"
OUT2="$(bash "$PAIR" 2>&1)"; check "exits 0" $?
cmp -s "$HQ_ENV_FILE" "$WORK/hq.before"; check "hq file unchanged" $?
cmp -s "$SITE_ENV_FILE" "$WORK/site.before"; check "site file unchanged" $?
[[ "$OUT2" != *"$S1"* ]]; check "the secret is not printed" $?

echo "site drifted from hq"
others="$(awk 'index($0,"HQ_PAIRING_SECRET=")!=1' "$SITE_ENV_FILE")"; printf '%s\nHQ_PAIRING_SECRET=stale\n' "$others" > "$SITE_ENV_FILE"
bash "$PAIR" >/dev/null 2>&1
[ "$(val HQ_PAIRING_SECRET "$SITE_ENV_FILE")" = "$S1" ] && [ "$(grep -c '^HQ_PAIRING_SECRET=' "$SITE_ENV_FILE")" -eq 1 ]; check "site is set back to hq's value, once" $?

echo "the relay's file drifted from hq"
printf 'HQ_RELAY_SECRET=stale\nOTHER=kept\n' > "$RELAY_ENV_FILE"
bash "$PAIR" >/dev/null 2>&1
[ "$(val HQ_RELAY_SECRET "$RELAY_ENV_FILE")" = "$S1R" ] && [ "$(val OTHER "$RELAY_ENV_FILE")" = "kept" ]; check "the relay is set back to hq's value, other keys kept" $?

echo "an existing HQ_URL and an existing secret are kept"
printf 'HQ_URL=https://hq.example.com\n' > "$SITE_ENV_FILE"
printf 'HQ_PAIRING_SECRET="%s"\n' "$(printf 'ab%.0s' $(seq 1 32))" > "$HQ_ENV_FILE"
bash "$PAIR" >/dev/null 2>&1
[ "$(val HQ_URL "$SITE_ENV_FILE")" = "https://hq.example.com" ]; check "site HQ_URL kept" $?
[ "$(val HQ_PAIRING_SECRET "$SITE_ENV_FILE")" = "$(printf 'ab%.0s' $(seq 1 32))" ]; check "hq's quoted secret is copied unquoted" $?

sed -i.bak '/^HQ_RELAY_LINE_URL=/d' "$HQ_ENV_FILE"; rm -f "$HQ_ENV_FILE.bak"
printf 'HQ_RELAY_LINE_URL=wss://elsewhere.example/relay-line\n' >> "$HQ_ENV_FILE"
bash "$PAIR" >/dev/null 2>&1
[ "$(val HQ_RELAY_LINE_URL "$HQ_ENV_FILE")" = "wss://elsewhere.example/relay-line" ] && [ "$(grep -c '^HQ_RELAY_LINE_URL=' "$HQ_ENV_FILE")" -eq 1 ]; check "a relay line address already set is kept" $?

echo "a too-short relay secret is refused"
printf 'HQ_PAIRING_SECRET=%s\nHQ_RELAY_SECRET=short\n' "$S1" > "$HQ_ENV_FILE"; : > "$SITE_ENV_FILE"; rm -f "$RELAY_ENV_FILE"
bash "$PAIR" >/dev/null 2>&1; [ $? -ne 0 ]; check "exits non-zero" $?
[ ! -e "$RELAY_ENV_FILE" ]; check "the relay's file is untouched" $?

echo "a too-short secret is refused"
printf 'HQ_PAIRING_SECRET=short\n' > "$HQ_ENV_FILE"; : > "$SITE_ENV_FILE"
bash "$PAIR" >/dev/null 2>&1; [ $? -ne 0 ]; check "exits non-zero" $?
[ -z "$(val HQ_PAIRING_SECRET "$SITE_ENV_FILE")" ]; check "site untouched" $?

echo "two runs at once agree on one secret"
printf 'PORT=1\n' > "$HQ_ENV_FILE"; printf 'PORT=2\n' > "$SITE_ENV_FILE"
bash "$PAIR" >/dev/null 2>&1 & bash "$PAIR" >/dev/null 2>&1 & wait
[ "$(grep -c '^HQ_RELAY_SECRET=' "$HQ_ENV_FILE")" -eq 1 ] && [ "$(val HQ_RELAY_SECRET "$HQ_ENV_FILE")" = "$(val HQ_RELAY_SECRET "$RELAY_ENV_FILE")" ] &&
  [ "$(grep -c '^HQ_PAIRING_SECRET=' "$HQ_ENV_FILE")" -eq 1 ] && [ "$(val HQ_PAIRING_SECRET "$HQ_ENV_FILE")" = "$(val HQ_PAIRING_SECRET "$SITE_ENV_FILE")" ]; check "one secret, identical on both sides" $?
[ ! -d "$HQ_ENV_FILE.pair.lock" ]; check "lock released" $?

echo "a missing env file does not block startup"
rm -f "$SITE_ENV_FILE"
bash "$PAIR" >/dev/null 2>&1; check "exits 0" $?

[ "$FAILS" -eq 0 ] && echo "all passed" || { echo "$FAILS failed"; exit 1; }
