#!/usr/bin/env bash
# Join a further development site to the development hq, without the Fleet Console (which needs a host service).
#
#   scripts/dev/add-site.sh <the further site's .env.server> [--name <label>] [--live-previews]
#
# The further site runs from its own checkout (a git worktree of this repository, say), whose site/.env.server
# has its own PORT, SITE_ROOT, DATABASE_URL, HOST_NAMESPACE and control socket, and has started once, so its
# database holds its site id. This script then:
#
#   - gives that file a credential of its own, HQ_PAIRING_SECRET (openssl rand -hex 32), never hq's own site's, and
#     kept when it already has one; HQ_URL=http://localhost:<hq server port> if it has none; and its own
#     SECRETS_MASTER_KEY (site/scripts/dev/ensure-secrets-key.sh);
#   - reads the site's id from its database, and writes hq's row for it into hq's development database: the site
#     id, the label, and the SHA-256 of the credential, as hq keeps any site's (hq/src/sites/credentials.ts).
#
# The site then connects at its next start as any registered site does (hq/src/sites/registrationService.ts,
# `authenticateSite`). Nothing in hq changes: this only writes the row a fleet admin's adding would, straight into
# the development database's container, so it works against the development databases on this machine only.
# --live-previews turns *Live previews on this site* on for it, which the Fleet Console would otherwise set.
#
# Idempotent: a second run changes nothing but the label and the live previews setting it is given. No secret is
# ever printed. Overrides, for testing: HQ_ENV_FILE, HQ_DB_CONTAINER, SITE_DB_CONTAINER, HQ_DATABASE_NAME.
# Against a fresh HQ (hq/scripts/dev/fresh.sh), set HQ_DATABASE_NAME=agenthix_fresh: the name otherwise comes from
# hq/.env.server, the normal development database.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HQ_ENV_FILE="${HQ_ENV_FILE:-$ROOT/hq/.env.server}"
HQ_DB_CONTAINER="${HQ_DB_CONTAINER:-agenthix-dev-hq-db}"
SITE_DB_CONTAINER="${SITE_DB_CONTAINER:-agenthix-dev-site-db}"
eval "$(bash "$ROOT/scripts/dev/ports.sh")"
DEV_HQ_URL="http://localhost:$HQ_SERVER_PORT"
MIN_LENGTH=32

usage() { echo "usage: scripts/dev/add-site.sh <the further site's .env.server> [--name <label>] [--live-previews]" >&2; exit 2; }

SITE_ENV_FILE=""
LABEL=""
LIVE_PREVIEWS=false
while [ $# -gt 0 ]; do
  case "$1" in
    --name) [ $# -ge 2 ] || usage; LABEL="$2"; shift 2 ;;
    --live-previews) LIVE_PREVIEWS=true; shift ;;
    -*) usage ;;
    *) [ -z "$SITE_ENV_FILE" ] || usage; SITE_ENV_FILE="$1"; shift ;;
  esac
done
[ -n "$SITE_ENV_FILE" ] || usage

refuse() { echo "add-site: $1 Nothing was changed." >&2; exit 1; }

# Value of KEY in FILE: last assignment wins, surrounding quotes and whitespace removed.
env_value() {
  local key="$1" file="$2"
  [ -f "$file" ] || return 0
  awk -v key="$key" '
    index($0, key "=") == 1 { v = substr($0, length(key) + 2) }
    END {
      gsub(/^[ \t]+|[ \t\r]+$/, "", v)
      if (v ~ /^".*"$/ || v ~ /^'"'"'.*'"'"'$/) v = substr(v, 2, length(v) - 2)
      print v
    }
  ' "$file"
}

# As pair.sh: the value travels in the environment, never on a command line.
set_env_value() {
  local key="$1" value_var="$2" file="$3" tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/add-site.XXXXXX")"
  KEY="$key" VALUE="${!value_var}" awk '
    BEGIN { key = ENVIRON["KEY"]; val = ENVIRON["VALUE"] }
    index($0, key "=") == 1 { if (!done) { print key "=" val; done = 1 } ; next }
    { print }
    END { if (!done) print key "=" val }
  ' "$file" > "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

# The database a postgres address names, without its query.
db_name() { local rest="${1##*/}"; echo "${rest%%\?*}"; }

[ -f "$SITE_ENV_FILE" ] || refuse "$SITE_ENV_FILE not found: copy site/.env.server.example into the further site's checkout first."
real() { (cd "$(dirname "$1")" && echo "$(pwd -P)/$(basename "$1")"); }
if [ -f "$ROOT/site/.env.server" ] && [ "$(real "$SITE_ENV_FILE")" = "$(real "$ROOT/site/.env.server")" ]; then
  refuse "$SITE_ENV_FILE is hq's own site's file, which scripts/dev/pair.sh pairs. Give the further site's."
fi
case "$HQ_DB_CONTAINER" in
  *-dev-*) ;;
  *) refuse "hq's database container ($HQ_DB_CONTAINER) is not a development one: a site joins any other hq through the Fleet Console." ;;
esac

SITE_DB_URL="$(env_value DATABASE_URL "$SITE_ENV_FILE")"
[ -n "$SITE_DB_URL" ] || refuse "$SITE_ENV_FILE has no DATABASE_URL: the further site needs a database of its own."
OWN_SITE_DB_URL="$(env_value DATABASE_URL "$ROOT/site/.env.server")"
[ "$SITE_DB_URL" != "$OWN_SITE_DB_URL" ] || refuse "$SITE_ENV_FILE uses hq's own site's database: give the further site a database of its own."
[ -n "$(env_value HOST_NAMESPACE "$SITE_ENV_FILE")" ] || refuse "$SITE_ENV_FILE has no HOST_NAMESPACE: set one of its own (agenthix-dev2, say), so its containers' names do not clash with hq's own site's."

SITE_DB_NAME="$(db_name "$SITE_DB_URL")"
[[ "$SITE_DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || refuse "the further site's database name ($SITE_DB_NAME) is not a plain name."
HQ_DATABASE_NAME="${HQ_DATABASE_NAME:-$(db_name "$(env_value DATABASE_URL "$HQ_ENV_FILE")")}"
HQ_DATABASE_NAME="${HQ_DATABASE_NAME:-agenthix}"
[[ "$HQ_DATABASE_NAME" =~ ^[A-Za-z0-9_]+$ ]] || refuse "hq's database name ($HQ_DATABASE_NAME) is not a plain name."

# Run psql inside a development database container: no local client needed.
psql_in() { local container="$1" db="$2"; shift 2; docker exec -i "$container" psql -U agenthix -d "$db" -qtAX -v ON_ERROR_STOP=1 "$@"; }

SITE_ID="$(psql_in "$SITE_DB_CONTAINER" "$SITE_DB_NAME" -c 'SELECT "siteId" FROM "SiteConfig" LIMIT 1' 2>/dev/null | tr -d '[:space:]' || true)"
[ -n "$SITE_ID" ] || refuse "the further site's database ($SITE_DB_NAME) holds no site id yet: start the site once from its checkout (npm run db:deploy, then npm run dev), stop it, and run this again."
[[ "$SITE_ID" =~ ^[0-9a-fA-F-]{36}$ ]] || refuse "the further site's id is not one a site makes."

HQ_SECRET="$(env_value HQ_PAIRING_SECRET "$HQ_ENV_FILE")"
SECRET="$(env_value HQ_PAIRING_SECRET "$SITE_ENV_FILE")"
if [ "${#SECRET}" -lt "$MIN_LENGTH" ] || [ "$SECRET" = "$HQ_SECRET" ]; then
  SECRET="$(openssl rand -hex 32)"
  set_env_value HQ_PAIRING_SECRET SECRET "$SITE_ENV_FILE"
  echo "add-site: gave the further site a credential of its own (HQ_PAIRING_SECRET)"
fi
if [ -z "$(env_value HQ_URL "$SITE_ENV_FILE")" ]; then
  set_env_value HQ_URL DEV_HQ_URL "$SITE_ENV_FILE"
  echo "add-site: set HQ_URL=$DEV_HQ_URL in the further site's file"
fi
SITE_ENV_FILE="$SITE_ENV_FILE" bash "$ROOT/site/scripts/dev/ensure-secrets-key.sh"

HASH="$(printf '%s' "$SECRET" | openssl dgst -sha256 -r | cut -d' ' -f1)"
[ -n "$LABEL" ] || LABEL="$(env_value HOST_NAMESPACE "$SITE_ENV_FILE")"
[[ "$LABEL" =~ ^[A-Za-z0-9][A-Za-z0-9\ ._-]{0,63}$ ]] || refuse "the name \"$LABEL\" is not one to give a site: letters, digits, spaces, dots, dashes and underscores, up to 64."

# The values go to psql as variables, quoted by psql itself (:'name'), never spliced into the statement.
psql_in "$HQ_DB_CONTAINER" "$HQ_DATABASE_NAME" \
  -v site_id="$SITE_ID" -v label="$LABEL" -v hash="$HASH" -v live="$LIVE_PREVIEWS" >/dev/null <<'SQL'
INSERT INTO "ExecutionSite" ("id", "siteId", "label", "status", "credentialHash", "isDefault", "livePreviewsAllowed", "updatedAt")
VALUES (gen_random_uuid()::text, :'site_id', :'label', 'REGISTERED', :'hash', false, :'live'::boolean, now())
ON CONFLICT ("siteId") DO UPDATE SET
  "label" = EXCLUDED."label",
  "credentialHash" = EXCLUDED."credentialHash",
  "livePreviewsAllowed" = EXCLUDED."livePreviewsAllowed",
  "status" = CASE WHEN "ExecutionSite"."status" = 'REVOKED' THEN 'REGISTERED' ELSE "ExecutionSite"."status" END,
  "revokedAt" = NULL,
  "updatedAt" = now()
WHERE NOT "ExecutionSite"."isDefault";
SQL
echo "add-site: hq knows the further site as \"$LABEL\"; start it from its checkout and it connects."
