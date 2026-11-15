#!/usr/bin/env bash
# Installs hq exactly as its lockfile pins it and generates Wasp's code, from a clean checkout or an installed one:
#   hq/scripts/install.sh
# Needs core built and ui installed: hq uses both through file:.
#
# hq's package-lock.json also pins the packages of the code Wasp generates (the npm workspaces under .wasp/out), and
# a clean checkout does not have that code yet. `npm ci` installs the Wasp CLI and leaves the lockfile alone, and is
# skipped when node_modules is already there, so a caller can link ui to hq's React before Wasp compiles.
# `wasp install` sets up Wasp's own packages, then runs `npm install` before the generated code exists, which drops
# those packages from the lockfile. The lockfile is put back before `wasp compile`, which generates the code and
# installs again, now against the whole lockfile. Without that, the compile resolves them anew at whatever is newest.
# Fails when the lockfile differs at the end.
set -euo pipefail
cd "$(dirname "$0")/.."
export WASP_TELEMETRY_DISABLE=1

held="$(mktemp)"
trap 'rm -f "$held"' EXIT
cp package-lock.json "$held"

[ -d node_modules ] || npm ci --no-audit --no-fund
# The Wasp CLI is the version hq pins as a dev dependency, never a global one.
npx wasp install
cp "$held" package-lock.json
npx wasp compile

if ! cmp -s package-lock.json "$held"; then
  echo "hq's install changed hq/package-lock.json, so the lockfile is not what package.json and the code Wasp" >&2
  echo "generates resolve to. Make it with npm install in hq once npx wasp compile has run, and commit it." >&2
  exit 1
fi
