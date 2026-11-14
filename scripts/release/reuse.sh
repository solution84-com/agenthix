#!/usr/bin/env bash
# Asks the registry whether an image part is already built for a content key, and may be reused instead of built:
#   scripts/release/reuse.sh <image> <part> <arch> <key>
# <image> is the part's name under the registry, without a tag. The image is reused only when <image>:build-<key>-<arch>
# exists and carries a build attestation from release-build.yml on main or a release branch (cosign, keyless) whose
# predicate names this part, architecture and key. Prints the image's digest and exits 0 when it can be reused; exits 1,
# saying why on stderr, when it cannot. Needs docker (buildx), cosign, jq and, for a private package, a registry login.
# GITHUB_REPOSITORY (owner/name) names the repository whose workflow must have made the attestation. ATTESTED_REF, when
# set, is one more ref (refs/heads/<branch>) whose attestation counts: only the release build's check of the image it has
# just attested sets it, so that a dry run of Release on a fix branch can pass; what is reused and what a tag promotes
# never count it.
set -uo pipefail

image="${1:-}" part="${2:-}" arch="${3:-}" key="${4:-}"
[ -n "$image" ] && [ -n "$part" ] && [ -n "$arch" ] && [ -n "$key" ] || { echo "Usage: $0 <image> <part> <arch> <key>" >&2; exit 2; }
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY (owner/name) is not set.}"

tag="$image:build-$key-$arch"
digest="$(docker buildx imagetools inspect "$tag" --format '{{json .Manifest}}' 2>/dev/null | jq -r '.digest // empty')"
if ! printf '%s' "$digest" | grep -Eq '^sha256:[0-9a-f]{64}$'; then
  echo "$tag is not in the registry." >&2
  exit 1
fi

repo="${GITHUB_REPOSITORY//./\\.}"
refs='refs/heads/(main|release/.+)'
if [ -n "${ATTESTED_REF:-}" ]; then
  refs="($refs|$(printf '%s' "$ATTESTED_REF" | sed 's/[][\\.^$*+?(){}|]/\\&/g'))"
fi
identity="^https://github\\.com/$repo/\\.github/workflows/release-build\\.yml@$refs\$"
statements="$(cosign verify-attestation --type custom \
  --certificate-identity-regexp "$identity" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  "$image@$digest" 2>/dev/null)" || { echo "$tag carries no valid build attestation from release-build.yml on main or a release branch." >&2; exit 1; }

# The predicate is the JSON the build attached; some cosign versions wrap it as {Data: "<json>"}.
if printf '%s' "$statements" | jq -e -s --arg part "$part" --arg arch "$arch" --arg key "$key" '
  any(.[]; (.payload | @base64d | fromjson | .predicate
            | if type == "object" and has("Data") then (.Data | if type == "string" then fromjson else . end) else . end) as $p
            | $p.part == $part and $p.arch == $arch and $p.key == $key)' >/dev/null 2>&1; then
  echo "$digest"
else
  echo "$tag has an attestation, but not one for part $part, architecture $arch and key $key." >&2
  exit 1
fi
