#!/usr/bin/env bash
# The release rehearsal on this machine, for its own architecture: what the release build (release-build.yml) runs on
# the release branch, except the registry and the other architecture.
#   scripts/release/prove.sh [<part> ...]
#   RELEASE_VERSION=0.3.0 scripts/release/prove.sh   names the version to be tagged, so the rehearsal also refuses while a
#   flag released in an earlier minor release is still listed in core (scripts/release/flags-overdue.mjs, adr-0172).
#   The tag's own workflow makes the same check whether or not the rehearsal did.
# 1. The content keys of the working tree (scripts/images/keys.mjs), and the images: each part whose local image does not
#    carry its key is built and started (scripts/images/start-test-all.sh); the others are only started. With parts
#    named, only those are built and started; the install test still needs every image.
# 2. The install test (scripts/install-test/run.sh) from those images.
# 3. The guide's screenshots (npm run guide:screenshots in hq/), with the site and hq started for it as
#    guide-screenshots.yml starts them, on ports the operating system gives, against the guide databases.
# Before any of that, the Sigstore trust root hq's image carries must be fresh enough to ship (scripts/release/trust-root.mjs):
# the rehearsal only reads it, and refuses when it is old, naming the refresh to run and commit.
# Each step's time is printed, and the last lines are one per step: passes or fails. It refuses, before anything is run,
# where a step cannot run on this machine, and says what holds it.
# shellcheck disable=SC2329 # the steps are run by name, through step
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 2

say() { printf '\n== %s\n' "$*"; }
refuse() { printf '\nCannot prove the release here: %s\nNothing was run.\n' "$*" >&2; exit 2; }

# --- Refuse before running anything --------------------------------------------------------------------------------
command -v docker >/dev/null || refuse 'Docker is not on this machine.'
docker info >/dev/null 2>&1 || refuse 'Docker is not running.'
command -v node >/dev/null || refuse 'Node is not on this machine.'
trust_root="$(node scripts/release/trust-root.mjs 2>&1)" || refuse "$trust_root"
if [ -n "${RELEASE_VERSION:-}" ]; then
  [ -f core/dist/shared/featureFlagReleases.js ] || refuse 'core is not built: cd core && npm run build.'
  overdue="$(node scripts/release/flags-overdue.mjs "$RELEASE_VERSION" 2>&1)" || refuse "$overdue"
else
  echo 'RELEASE_VERSION is not set, so released flags are not checked against the version to be tagged.'
fi


[ -d hq/node_modules ] && [ -d site/node_modules ] || refuse 'hq/ and site/ are not installed (the guide screenshots start both): run npm install in each.'
[ -f hq/.env.server ] || [ -n "${GUIDE_HQ_DATABASE_URL:-}" ] || refuse 'the guide screenshots need a database: hq/.env.server, or GUIDE_HQ_DATABASE_URL and GUIDE_SITE_DATABASE_URL.'

names=() times=() results=()
record() { names+=("$1"); results+=("$2"); times+=("$3"); }

step() { # <name> <function> [<argument> ...]
  local name="$1" started=$SECONDS status
  say "$name"
  "${@:2}"; status=$?
  local took=$((SECONDS - started))
  printf '%s took %ds\n' "$name" "$took"
  if [ "$status" -eq 0 ]; then record "$name" passes "$took"; else record "$name" FAILS "$took"; fi
}

keys() {
  node scripts/images/keys.mjs --worktree | while read -r part key; do printf '%-12s %s\n' "$part" "${key:0:12}"; done
}

images() { scripts/images/start-test-all.sh "$@"; }

install_test() {
  # The install test needs every image; it builds none that is missing, start-test-all.sh does, with the same keys.
  scripts/images/start-test-all.sh >/dev/null 2>&1 || { echo 'Some image is not built and started; see the previous step.'; return 1; }
  scripts/install-test/run.sh
}

guide_screenshots() (
  logs="$(mktemp -d "${TMPDIR:-/tmp}/prove-guide.XXXXXX")"
  free_ports() {
    node -e '
      const net = require("node:net");
      const take = () => new Promise((ok) => { const s = net.createServer().listen(0, "127.0.0.1", () => ok(s)); });
      (async () => {
        const held = [await take(), await take(), await take()];
        console.log(held.map((s) => s.address().port).join(" "));
        held.forEach((s) => s.close());
      })();'
  }
  read -r web server site <<<"$(free_ports)"
  export HQ_WEB_PORT="$web" HQ_SERVER_PORT="$server" GUIDE_SITE_PORT="$site"
  export E2E_CLIENT_URL="http://localhost:$web" E2E_SERVER_URL="http://localhost:$server" WASP_TELEMETRY_DISABLE=1 CI=true
  mkdir -p "$logs/site-root" "$logs/hq-storage"
  # hq's own client settings, put back afterwards.
  [ ! -f hq/.env.client ] || cp hq/.env.client "$logs/env.client.backup"
  printf 'PORT=%s\nREACT_APP_API_URL=http://localhost:%s\nREACT_APP_CLIENT_URL=http://localhost:%s\n' "$web" "$server" "$web" > hq/.env.client
  HQ_PAIRING_SECRET="$(openssl rand -hex 32)"; export HQ_PAIRING_SECRET
  GUIDE_HQ_SECRETS_KEY="$(openssl rand -base64 32)"; export GUIDE_HQ_SECRETS_KEY
  GUIDE_SITE_SECRETS_KEY="$(openssl rand -base64 32)"; export GUIDE_SITE_SECRETS_KEY
  export GUIDE_LOGS="$logs" SITE_ROOT="$logs/site-root" HQ_STORAGE_ROOT="$logs/hq-storage" HQ_MACHINE_NAME=fernhill-hq

  servers=''
  cleanup() {
    # The servers run in a process group of their own, so stopping them never reaches this script.
    [ -z "$servers" ] || kill -TERM -- "-$servers" 2>/dev/null || true
    if [ -f "$logs/env.client.backup" ]; then cp "$logs/env.client.backup" hq/.env.client; else rm -f hq/.env.client; fi
    echo "Logs: $logs"
  }
  trap cleanup EXIT

  node hq/scripts/guide/with-guide-db.mjs --reset true || return 1
  # Job control gives the servers a process group of their own: npx and Wasp signal their whole group when stopped,
  # which would otherwise stop this script too.
  set -m
  # shellcheck disable=SC2016 # the variables expand in the inner bash, which has the guide databases' addresses
  node hq/scripts/guide/with-guide-db.mjs bash -c '
    (cd site && PORT="$GUIDE_SITE_PORT" HQ_URL="http://localhost:$HQ_SERVER_PORT" AGENT_CONTAINER_ISOLATION=false \
      SECRETS_MASTER_KEY="$GUIDE_SITE_SECRETS_KEY" DATABASE_URL="$GUIDE_SITE_DATABASE_URL" npm run dev > "$GUIDE_LOGS/site.log" 2>&1 < /dev/null) &
    (cd hq && PORT="$HQ_SERVER_PORT" WASP_SERVER_URL="http://localhost:$HQ_SERVER_PORT" WASP_WEB_CLIENT_URL="http://localhost:$HQ_WEB_PORT" \
      SECRETS_MASTER_KEY="$GUIDE_HQ_SECRETS_KEY" npx wasp start > "$GUIDE_LOGS/hq.log" 2>&1 < /dev/null) &
    wait' &
  servers=$!
  set +m
  wait_for() {
    for _ in $(seq 1 120); do
      curl -s -o /dev/null "$1" && return 0
      kill -0 "$servers" 2>/dev/null || { echo "The servers stopped; see $logs." >&2; return 1; }
      sleep 5
    done
    echo "$1 did not come up; see $logs." >&2
    return 1
  }
  wait_for "http://localhost:$HQ_SERVER_PORT/health" && wait_for "http://localhost:$HQ_WEB_PORT/" && wait_for "http://localhost:$GUIDE_SITE_PORT/" || return 1
  (cd hq && SECRETS_MASTER_KEY="$GUIDE_HQ_SECRETS_KEY" npm run guide:screenshots) || return 1
  (cd hq && npm run guide:compare)
)

step 'Content keys' keys
step 'Images built and started' images "$@"
if [ "${results[1]}" = passes ]; then
  step 'Install test' install_test
else
  say 'Install test'; echo 'Not run: the images did not all pass.'; record 'Install test' 'FAILS' 0
fi
step 'Guide screenshots' guide_screenshots

echo
echo '=== release rehearsal'
failed=0
for i in "${!names[@]}"; do
  printf '%-8s %-26s %ss\n' "${results[$i]}" "${names[$i]}" "${times[$i]}"
  [ "${results[$i]}" = passes ] || failed=1
done
exit "$failed"
