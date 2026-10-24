#!/usr/bin/env bash
# The release build's plan: for each part and architecture, whether its image is reused or must be built. Prints a JSON
# array, one entry per part and architecture:
#   {part, name, image, file, target, arch, runner, key, status: "reused"|"missing", digest}
# Read from the environment: KEYS ({part: key}), IMAGES (the parts with their Dockerfile and target, as
# scripts/images/parts.mjs lists them, as JSON), NAMES ({part: image name}), REGISTRY. REUSE names the script that
# decides reuse (default: reuse.sh beside this one).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
reuse="${REUSE:-$here/reuse.sh}"
: "${KEYS:?}" "${IMAGES:?}" "${NAMES:?}" "${REGISTRY:?}"

entries=()
for arch in amd64 arm64; do
  case "$arch" in amd64) runner=ubuntu-24.04 ;; arm64) runner=ubuntu-24.04-arm ;; esac
  while IFS= read -r row; do
    part="$(jq -r .part <<<"$row")"
    key="$(jq -r --arg p "$part" '.[$p]' <<<"$KEYS")"
    name="$(jq -r --arg p "$part" '.[$p]' <<<"$NAMES")"
    image="$REGISTRY/$name"
    # Its reason for a refusal goes to the log on stderr; its digest, when reusable, is all it prints.
    if found="$("$reuse" "$image" "$part" "$arch" "$key")"; then status=reused; else status=missing; found=''; fi
    entries+=("$(jq -c --arg name "$name" --arg image "$image" --arg arch "$arch" --arg runner "$runner" --arg key "$key" \
      --arg status "$status" --arg digest "$found" '. + {name: $name, image: $image, arch: $arch, runner: $runner, key: $key, status: $status, digest: $digest}' <<<"$row")")
  done < <(jq -c '.[]' <<<"$IMAGES")
done
printf '%s\n' "${entries[@]}" | jq -s -c .
