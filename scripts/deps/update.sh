#!/usr/bin/env bash
# Takes the month's minor and patch updates, by the rules in docs/architecture/dependencies.md, from a clean checkout:
#   scripts/deps/update.sh [--record] [--summary <file>]
# 1. npm: `npm update --package-lock-only` in every module with a lockfile; only lockfiles move (scripts/deps/npm.mjs).
# 2. Base images: each FROM to the newest digest of its tag, within its major; Node to the newest 24.x.y everywhere it
#    is named, and cosign in the host image and the workflows together (scripts/deps/images.mjs, over the registries'
#    HTTP API).
# 3. Actions: each `uses:` pin to the newest release of its major, its commit and its comment (scripts/deps/actions.mjs,
#    over `git ls-remote`).
# Prints what moved, by module, version to version, in Markdown, and writes the same to --summary. With --record (Take
# the updates, .github/workflows/take-updates.yml), it also records the run in scripts/deps/taken.json and raises the
# rebuild epoch in scripts/images/parts.json. Runs the same on the dev machine and in CI; needs node, npm, git and the
# network (the npm registry, the image registries, github.com). hq's lockfile also covers the code Wasp generates, so
# hq is compiled first when it has not been. Changes files only: committing them is the caller's.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

record=() summary_file=""
while [ $# -gt 0 ]; do
  case "$1" in
    --record) record=(--record) ;;
    --summary) summary_file="${2:?--summary needs a file}"; shift ;;
    *) echo "Usage: $0 [--record] [--summary <file>]" >&2; exit 2 ;;
  esac
  shift
done

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Updates are taken from a clean checkout; commit or set aside these first:" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

# hq's lockfile also pins the packages of the code Wasp generates, so npm updates them only while that code is there.
# hq's install script generates it and leaves the lockfile as committed; `npm update` then moves it within the ranges.
if [ ! -f hq/.wasp/out/server/package.json ]; then
  echo "Compiling hq, so its lockfile keeps the packages of the code Wasp generates." >&2
  [ -d core/dist ] || (cd core && npm ci --no-audit --no-fund >&2 && npm run build >&2)
  [ -d ui/node_modules ] || (cd ui && npm ci --no-audit --no-fund >&2)
  hq/scripts/install.sh >&2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
node scripts/deps/npm.mjs --out "$work/npm.json"
node scripts/deps/images.mjs --out "$work/images.json"
node scripts/deps/actions.mjs --out "$work/actions.json"
node scripts/deps/record.mjs --npm "$work/npm.json" --images "$work/images.json" --actions "$work/actions.json" \
  ${record[@]+"${record[@]}"} > "$work/summary.md"

cat "$work/summary.md"
[ -z "$summary_file" ] || cp "$work/summary.md" "$summary_file"
