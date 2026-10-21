#!/usr/bin/env bash
# Checks hq/scripts/dev/ensure-secrets-key.sh against a temporary copy of the env
# file — never the real one. Run: bash hq/scripts/test/ensure-secrets-key.test.sh
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../dev" && pwd)/ensure-secrets-key.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/secrets-key-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
export HQ_ENV_FILE="$WORK/hq.env"
FAILS=0

check() { # description, condition-exit-code
  if [ "$2" -eq 0 ]; then echo "  ok   $1"; else echo "  FAIL $1"; FAILS=$((FAILS + 1)); fi
}
val() { awk -v k="$1" 'index($0, k "=") == 1 { print substr($0, length(k) + 2) }' "$2"; }

echo "a blank key is generated"
printf '# hq\nSITE_ADMIN_KEY=abc\nSECRETS_MASTER_KEY=\nPORT=4101\n' > "$HQ_ENV_FILE"
chmod 640 "$HQ_ENV_FILE"
OUT1="$(bash "$SCRIPT" 2>&1)"; check "exits 0" $?
K1="$(val SECRETS_MASTER_KEY "$HQ_ENV_FILE")"
[ "$(printf '%s' "$K1" | openssl base64 -d -A | wc -c | tr -d ' ')" = "32" ]; check "it is 32 bytes of base64" $?
[ "$(grep -c '^SECRETS_MASTER_KEY=' "$HQ_ENV_FILE")" -eq 1 ]; check "written once" $?
[ "$(val SITE_ADMIN_KEY "$HQ_ENV_FILE")" = "abc" ] && [ "$(val PORT "$HQ_ENV_FILE")" = "4101" ] && grep -q '^# hq$' "$HQ_ENV_FILE"; check "other lines preserved" $?
[[ "$OUT1" != *"$K1"* ]]; check "the key is not printed" $?
[ "$(stat -f %Lp "$HQ_ENV_FILE" 2>/dev/null || stat -c %a "$HQ_ENV_FILE")" = "640" ]; check "file permissions preserved" $?

echo "a second run changes nothing"
cp "$HQ_ENV_FILE" "$WORK/before"
bash "$SCRIPT" >/dev/null 2>&1; check "exits 0" $?
cmp -s "$HQ_ENV_FILE" "$WORK/before"; check "file unchanged" $?

echo "a missing line is appended"
printf 'PORT=4101\n' > "$HQ_ENV_FILE"
bash "$SCRIPT" >/dev/null 2>&1
[ -n "$(val SECRETS_MASTER_KEY "$HQ_ENV_FILE")" ]; check "key added" $?

echo "an existing quoted key is never replaced"
existing="$(openssl rand -base64 32)"
printf 'SECRETS_MASTER_KEY="%s"\n' "$existing" > "$HQ_ENV_FILE"
bash "$SCRIPT" >/dev/null 2>&1; check "exits 0" $?
[ "$(val SECRETS_MASTER_KEY "$HQ_ENV_FILE")" = "\"$existing\"" ]; check "value kept" $?

echo "a value that is not a 32-byte key is reported, not replaced"
printf 'SECRETS_MASTER_KEY=short\n' > "$HQ_ENV_FILE"
bash "$SCRIPT" >/dev/null 2>&1; [ $? -ne 0 ]; check "exits non-zero" $?
[ "$(val SECRETS_MASTER_KEY "$HQ_ENV_FILE")" = "short" ]; check "value kept" $?

echo "a missing file is not an error"
HQ_ENV_FILE="$WORK/none.env" bash "$SCRIPT" >/dev/null 2>&1; check "exits 0" $?

[ "$FAILS" -eq 0 ] || { echo "$FAILS check(s) failed"; exit 1; }
echo "all checks passed"
