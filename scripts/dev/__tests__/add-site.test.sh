#!/usr/bin/env bash
# Checks scripts/dev/add-site.sh against temporary env files and a stand-in `docker` that answers psql — never the
# real files or databases. Run: bash scripts/dev/__tests__/add-site.test.sh
set -uo pipefail

ADD="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/add-site.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/add-site-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
FAILS=0
check() { if [ "$2" -eq 0 ]; then echo "  ok   $1"; else echo "  FAIL $1"; FAILS=$((FAILS + 1)); fi; }
val() { awk -v k="$1" 'index($0, k "=") == 1 { print substr($0, length(k) + 2) }' "$2"; }

# The stand-in docker: `docker exec -i <container> psql … -d <db> …`. A -c query answers the site id; a statement on
# stdin is recorded with the variables it was given.
mkdir -p "$WORK/bin"
cat > "$WORK/bin/docker" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
if printf '%s\n' "$@" | grep -qx -- '-c'; then
  [ -n "${STUB_SITE_ID:-}" ] && echo "$STUB_SITE_ID"
  exit 0
fi
cat > "$STUB_SQL"
STUB
chmod +x "$WORK/bin/docker"
export PATH="$WORK/bin:$PATH" STUB_LOG="$WORK/docker.log" STUB_SQL="$WORK/statement.sql"
export STUB_SITE_ID="11111111-2222-4333-8444-555555555555"
export HQ_ENV_FILE="$WORK/hq.env"
HQ_SECRET="$(printf 'a%.0s' {1..64})"
printf 'HQ_PAIRING_SECRET=%s\nDATABASE_URL=postgresql://u:p@localhost:4109/agenthix\n' "$HQ_SECRET" > "$HQ_ENV_FILE"
SITE2="$WORK/site2.env"
printf 'PORT=4202\nHOST_NAMESPACE=agenthix-dev2\nDATABASE_URL=postgresql://agenthix:agenthix@localhost:4209/agenthix_site2\nHQ_PAIRING_SECRET=%s\n' "$HQ_SECRET" > "$SITE2"

echo "first run"
OUT1="$(bash "$ADD" "$SITE2" --live-previews 2>&1)"; check "exits 0" $?
S1="$(val HQ_PAIRING_SECRET "$SITE2")"
[ "${#S1}" -eq 64 ] && [ "$S1" != "$HQ_SECRET" ]; check "the site gets a credential of its own, not hq's own site's" $?
[ "$(val HQ_URL "$SITE2")" = "http://localhost:4101" ]; check "HQ_URL is filled in" $?
[ -n "$(val SECRETS_MASTER_KEY "$SITE2")" ]; check "the site gets its own SECRETS_MASTER_KEY" $?
grep -q 'agenthix-dev-site-db psql -U agenthix -d agenthix_site2' "$STUB_LOG"; check "the site id is read from the further site's database" $?
H1="$(printf '%s' "$S1" | openssl dgst -sha256 -r | cut -d' ' -f1)"
grep -q -- "-v hash=$H1" "$STUB_LOG"; check "hq is given the credential's SHA-256" $?
grep -q -- "-v site_id=$STUB_SITE_ID" "$STUB_LOG" && grep -q -- '-v label=agenthix-dev2' "$STUB_LOG" && grep -q -- '-v live=true' "$STUB_LOG"; check "with the site id, the namespace as its label, and live previews on" $?
grep -q 'agenthix-dev-hq-db psql -U agenthix -d agenthix ' "$STUB_LOG"; check "the row goes to hq's development database" $?
grep -q "ON CONFLICT (\"siteId\")" "$STUB_SQL" && grep -q ":'hash'" "$STUB_SQL" && ! grep -q "$H1" "$STUB_SQL"; check "values reach psql as variables, not in the statement" $?
! grep -q -- "$S1" "$STUB_LOG"; check "the credential never reaches the database or a command line" $?
[[ "$OUT1" != *"$S1"* ]]; check "the credential is not printed" $?

echo "second run"
cp "$SITE2" "$WORK/site2.before"
bash "$ADD" "$SITE2" --name "Second site" >/dev/null 2>&1; check "exits 0" $?
cmp -s "$SITE2" "$WORK/site2.before"; check "the site's file is unchanged" $?
grep -q -- '-v label=Second site' "$STUB_LOG"; check "the name given is the label" $?

echo "refusals"
: > "$STUB_LOG"
STUB_SITE_ID="" bash "$ADD" "$SITE2" >/dev/null 2>&1; [ $? -ne 0 ]; check "a site that never started is refused" $?
! grep -q 'agenthix-dev-hq-db' "$STUB_LOG"; check "and hq's database is not touched" $?
HQ_DB_CONTAINER=agenthix-hq-db bash "$ADD" "$SITE2" >/dev/null 2>&1; [ $? -ne 0 ]; check "a database container that is not a development one is refused" $?
NO_NS="$WORK/no-ns.env"; printf 'DATABASE_URL=postgresql://a:b@localhost:4209/agenthix_site3\n' > "$NO_NS"
bash "$ADD" "$NO_NS" >/dev/null 2>&1; [ $? -ne 0 ]; check "a site without a namespace of its own is refused" $?
[ -z "$(val HQ_PAIRING_SECRET "$NO_NS")" ]; check "and its file is unchanged" $?
bash "$ADD" "$SITE2" --name 'x; DROP TABLE' >/dev/null 2>&1; [ $? -ne 0 ]; check "a name with other characters is refused" $?

echo
[ "$FAILS" -eq 0 ] && echo "all passed" || { echo "$FAILS failed"; exit 1; }
