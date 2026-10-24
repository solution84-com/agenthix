#!/usr/bin/env bash
# Builds every image a machine runs, for this machine's own platform, and start-tests each (start-test.sh): part of
# the full regression before a unit merges to main:
#   scripts/images/start-test-all.sh [<part> ...]
# With parts named, only those. The images are tagged imgtest/<part>:dev and kept, each labelled content-key=<key>
# (scripts/images/keys.mjs, over the working tree as it is now): a part is built only when its image is missing or
# carries another key, so a second run builds only what changed. START_TEST_NO_BUILD=1 tests the ones already built.
# Each is built as a machine's own build is (with no version, as the release builds them). It stops at nothing:
# every image is tested, and it fails at the end if any one did. The parts are listed in scripts/images/parts.json.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2

KEYS="$(node scripts/images/keys.mjs --worktree --json)" || { echo "Could not compute the content keys." >&2; exit 2; }
PARTS="$(node scripts/images/parts.mjs)" || { echo "Could not read scripts/images/parts.json." >&2; exit 2; }

wanted=" $* "
results=()
failed=0
# The list is read on its own descriptor, so nothing run in the loop can swallow it from stdin.
while read -r part file target <&3; do
  [ "$#" -eq 0 ] || [[ "$wanted" == *" $part "* ]] || continue
  image="imgtest/$part:dev"
  echo "=== $part"
  key="$(node -p 'JSON.parse(process.argv[1])[process.argv[2]]' "$KEYS" "$part")"
  if [ "${START_TEST_NO_BUILD:-}" != 1 ]; then
    have="$(docker image inspect -f '{{index .Config.Labels "content-key"}}' "$image" 2>/dev/null || true)"
    if [ "$have" = "$key" ]; then
      echo "Already built for this content ($key)."
    else
      args=(-f "$file" -t "$image" --label "content-key=$key")
      [ "$target" = - ] || args+=(--target "$target")
      if ! docker build "${args[@]}" .; then
        results+=("FAILS  $part: it does not build")
        failed=$((failed + 1))
        continue
      fi
    fi
  fi
  if scripts/images/start-test.sh "$part" "$image"; then
    results+=("passes $part")
  else
    results+=("FAILS  $part: it does not start and answer")
    failed=$((failed + 1))
  fi
done 3<<< "$PARTS"

[ "${#results[@]}" -gt 0 ] || { echo "No image is named $*: the parts are $(echo "$PARTS" | cut -d' ' -f1 | paste -sd, - | sed 's/,/, /g')." >&2; exit 2; }
echo
echo "=== start test, every image"
printf '%s\n' "${results[@]}"
if [ "$failed" -gt 0 ]; then echo "$failed failed"; exit 1; fi
echo "all pass"
