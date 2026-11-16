#!/usr/bin/env bash
# The migration check: HQ's and the site's migrations of this working tree, applied to databases at a release's schema
# with rows in them, must keep every row. Since the first fresh installs, a migration carries data forward; this is
# the fast check of it, with no image built and no app started. For each app it:
#   1. applies the release's migrations (`git show <release>:<app>/migrations`) to an empty database, with Prisma's
#      `migrate deploy`, as the app does when it starts;
#   2. puts rows in it (seed-<app>.sql) and counts every table's rows (counts.sql);
#   3. applies this working tree's migrations on top, as an upgrade does;
#   4. counts again: no table may have lost a row or gone, and every seeded row must still be there.
# Before any of it, a new migration that drops a table or a column, changes a column's type, or makes one required
# with no default or backfill fails the check unless the commit that made it is marked breaking
# (scripts/migration-check/narrowing.mjs; docs/CONTRIBUTING.md): rows counted can't show a column's values lost.
#
#   scripts/migration-check/run.sh
#
# The databases are in one Postgres container of its own, <namespace>-db, published on 127.0.0.1 on a free port, and
# removed at the end with nothing else touched. Settings, all optional:
#   MIGRATION_CHECK_FROM        the release whose schema it starts from (the newest release tag before this commit unless
#                               set: `git describe --tags --match 'v*' --abbrev=0`)
#   MIGRATION_CHECK_NAMESPACE   the container's namespace (mck<random> unless set)
#   MIGRATION_CHECK_KEEP=1      leave the container running, and say how to remove it
# An app whose migrations were squashed after the release (the release's oldest migration is not in this tree) is
# skipped with one line saying so, and the check passes: an installation from before a squash is reinstalled, not
# upgraded (scripts/regression/squashed.mjs). From the first release after a squash nothing is skipped.
# It takes under a minute once the Postgres image is on the machine.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/scripts/migration-check"
FROM="${MIGRATION_CHECK_FROM:-$(git -C "$ROOT" describe --tags --match 'v*' --abbrev=0 2>/dev/null || true)}"
NS="${MIGRATION_CHECK_NAMESPACE:-mck$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 8 || true)}"
DB="$NS-db"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/$NS.XXXXXX")"

say() { printf '\n== %s\n' "$*"; }
fail() { printf '\nThe migration check failed: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || fail 'Docker is not on this machine.'
[ -n "$FROM" ] || fail 'no release tag (v*) is in this history to start from: fetch the tags (git fetch --tags), or set MIGRATION_CHECK_FROM.'
[[ "$NS" =~ ^[a-z][a-z0-9-]{0,30}$ ]] || fail "\"$NS\" cannot be a namespace."
git -C "$ROOT" rev-parse --verify --quiet "$FROM^{commit}" >/dev/null || fail "$FROM is not a commit here; fetch its tag first (git fetch --tags)."
node "$HERE/narrowing.mjs" "$FROM" || fail 'a new migration loses data and is not marked breaking (above).'
docker inspect "$DB" >/dev/null 2>&1 && fail "a container $DB is here already; nothing was touched."
# The Postgres an installation runs, fixed by its digest where the host service names it.
POSTGRES="$(sed -n "s/^export const POSTGRES_IMAGE = '\(.*\)'$/\1/p" "$ROOT/host/src/images/published.ts")"
[ -n "$POSTGRES" ] || fail 'could not read the Postgres image from host/src/images/published.ts.'
PORT="$(node "$ROOT/scripts/install-test/ports.mjs" free 1 20000 30000)"
PASSWORD="$(LC_ALL=C tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 24 || true)"

teardown() {
  local status=$?
  if [ "${MIGRATION_CHECK_KEEP:-0}" = 1 ]; then
    echo "Kept: the container $DB (postgresql://postgres@127.0.0.1:$PORT), and $WORK."
  else
    case "$DB" in "$NS"-*) docker rm -f "$DB" >/dev/null 2>&1 || true ;; esac
    rm -rf "$WORK"
  fi
  exit "$status"
}
trap teardown EXIT

say "Starting Postgres ($DB, 127.0.0.1:$PORT)"
docker run -d --name "$DB" -e POSTGRES_PASSWORD="$PASSWORD" -p "127.0.0.1:$PORT:5432" "$POSTGRES" >/dev/null
for _ in $(seq 1 60); do docker exec "$DB" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$DB" pg_isready -U postgres >/dev/null 2>&1 || fail 'Postgres did not start.'
sleep 2
psql() { docker exec -i "$DB" psql -v ON_ERROR_STOP=1 -X -q -U postgres -d "$1" "${@:2}"; }

# Prisma's migrate deploy needs only the migrations and a schema naming the database.
migrations() { # <app> <dir> <from: a commit, or "tree">
  mkdir -p "$2"
  printf 'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n' >"$2/schema.prisma"
  if [ "$3" = tree ]; then cp -R "$ROOT/$1/migrations" "$2/migrations"
  else git -C "$ROOT" archive "$3" "$1/migrations" | tar -x -C "$2" --strip-components 1
  fi
}
deploy() { # <app> <dir> <database>
  DATABASE_URL="postgresql://postgres:$PASSWORD@127.0.0.1:$PORT/$3" "$ROOT/$1/node_modules/.bin/prisma" migrate deploy --schema "$2/schema.prisma" >"$WORK/deploy-$1-$(basename "$2").log" 2>&1 \
    || { cat "$WORK/deploy-$1-$(basename "$2").log" >&2; fail "$1's migrations ($(basename "$2")) did not apply."; }
}

CHECKED=0
for app in hq site; do
  squashed="$(node "$ROOT/scripts/regression/squashed.mjs" "$FROM" "$app")" || fail "could not tell whether $app's migrations were squashed since $FROM."
  if [ -n "$squashed" ]; then say "$app"; echo "$squashed"; continue; fi
  CHECKED=$((CHECKED + 1))
  [ -x "$ROOT/$app/node_modules/.bin/prisma" ] || fail "$app's Prisma is not installed: run npm ci in $app first."
  database="check_$app"
  say "$app: the migrations of $FROM, then rows"
  psql postgres -c "CREATE DATABASE $database" >/dev/null
  migrations "$app" "$WORK/$app/from" "$FROM"
  deploy "$app" "$WORK/$app/from" "$database"
  psql "$database" <"$HERE/seed-$app.sql" >/dev/null || fail "the rows could not be put in $app's database at $FROM's schema (seed-$app.sql)."
  psql "$database" -t -A <"$HERE/counts.sql" >"$WORK/$app-before.txt"
  new="$(comm -13 <(ls "$WORK/$app/from/migrations") <(ls "$ROOT/$app/migrations") | grep -v '\.toml$' || true)"
  say "$app: this working tree's migrations on top (${new:+$(echo "$new" | wc -l | tr -d ' ') new: }${new:-none new})"
  migrations "$app" "$WORK/$app/tree" tree
  deploy "$app" "$WORK/$app/tree" "$database"
  psql "$database" -t -A <"$HERE/counts.sql" >"$WORK/$app-after.txt"
  lost="$(awk -F'|' '
    NR == FNR { key = ($2 == "seeded") ? $1 "|seeded" : $1; n = ($2 == "seeded") ? $3 : $2; before[key] = n; next }
    { key = ($2 == "seeded") ? $1 "|seeded" : $1; n = ($2 == "seeded") ? $3 : $2; after[key] = n }
    END { for (k in before) if (!(k in after)) print k ": " before[k] " before, no table after"; else if (after[k] + 0 < before[k] + 0) print k ": " before[k] " before, " after[k] " after" }
  ' "$WORK/$app-before.txt" "$WORK/$app-after.txt")"
  [ -z "$lost" ] || fail "$app's migrations lost rows:
$lost"
  echo "Every row is still there ($(grep -c . "$WORK/$app-before.txt") counts compared)."
done
[ "$CHECKED" -gt 0 ] || say 'The migration check passed: every app was skipped, see above'
[ "$CHECKED" -eq 0 ] || say 'The migration check passed'
