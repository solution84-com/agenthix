#!/usr/bin/env bash
# Builds every image a machine runs, for this machine's own platform, and start-tests each (start-test.sh): part of
# the full regression before a unit merges to main:
#   scripts/images/start-test-all.sh [<part> ...]
# With parts named, only those. The images are tagged imgtest/<part>:dev and kept, so a second run builds only
# what changed; START_TEST_NO_BUILD=1 tests the ones already built. Each is built as a machine's own build is
# (version dev). It stops at nothing: every image is tested, and it fails at the end if any one did.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2

# The parts, as the release builds them (.github/workflows/publish-images.yml): <part> <Dockerfile> <target>.
IMAGES=(
  'hq-server   hq/docker/Dockerfile          server'
  'hq-web      hq/docker/Dockerfile          web'
  'site-server site/docker/Dockerfile        server'
  'agent       site/docker/agent.Dockerfile  -'
  'host        host/docker/Dockerfile        host'
  'console     console/docker/Dockerfile     console'
)

wanted=" $* "
results=()
failed=0
for line in "${IMAGES[@]}"; do
  read -r part file target <<< "$line"
  [ "$#" -eq 0 ] || [[ "$wanted" == *" $part "* ]] || continue
  image="imgtest/$part:dev"
  echo "=== $part"
  if [ "${START_TEST_NO_BUILD:-}" != 1 ]; then
    args=(-f "$file" -t "$image")
    [ "$target" = - ] || args+=(--target "$target")
    if ! docker build "${args[@]}" .; then
      results+=("FAILS  $part: it does not build")
      failed=$((failed + 1))
      continue
    fi
  fi
  if scripts/images/start-test.sh "$part" "$image"; then
    results+=("passes $part")
  else
    results+=("FAILS  $part: it does not start and answer")
    failed=$((failed + 1))
  fi
done

[ "${#results[@]}" -gt 0 ] || { echo "No image is named $*: the parts are hq-server, hq-web, site-server, agent, host, console." >&2; exit 2; }
echo
echo "=== start test, every image"
printf '%s\n' "${results[@]}"
if [ "$failed" -gt 0 ]; then echo "$failed failed"; exit 1; fi
echo "all pass"
