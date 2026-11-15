#!/usr/bin/env bash
# Fails when an install changed a committed lockfile. The lockfile is the pin: what CI installs is what was committed.
# Every CI job that installs a module runs this after its installs:
#   scripts/deps/held.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

lockfiles=(':(glob)package-lock.json' ':(glob)**/package-lock.json')
if ! git diff --quiet -- "${lockfiles[@]}"; then
  echo "An install changed these lockfiles:" >&2
  git diff --stat -- "${lockfiles[@]}" >&2
  echo "Commit each lockfile from a clean install of its module (hq: hq/scripts/install.sh)." >&2
  exit 1
fi
