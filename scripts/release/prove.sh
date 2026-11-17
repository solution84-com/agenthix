#!/usr/bin/env bash
# The release rehearsal on this machine, for its own architecture: what the release build (release-build.yml) runs for
# a release, except the registry and the other architecture.
#   scripts/release/prove.sh [<part> ...]
#   RELEASE_VERSION=0.3.0 scripts/release/prove.sh   names the version to be tagged, so the rehearsal also refuses while a
#   flag released in an earlier minor release is still listed in core (scripts/release/flags-overdue.mjs, adr-0172).
#   The tag's own workflow makes the same check whether or not the rehearsal did.
# 1. The content keys of the working tree (scripts/images/keys.mjs), and the images: each part whose local image does not
#    carry its key is built and started (scripts/images/start-test-all.sh); the others are only started. With parts
#    named, only those are built and started; the install test still needs every image.
# 2. The install test (scripts/install-test/run.sh) from those images.
# 3. The guide's screenshots (scripts/guide/capture.mjs, which guide-screenshots.yml runs too), compared with the
#    released ones.
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
  # The one capture GitHub runs too (guide-screenshots.yml): hq built, then hq and the site on free ports.
  node scripts/guide/capture.mjs || return 1
  # The releases the pages link are read with the maintainer's GitHub token while the repository is private.
  (cd hq && GH_TOKEN="${GH_TOKEN:-$(gh auth token 2>/dev/null || true)}" npm run guide:compare)
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
