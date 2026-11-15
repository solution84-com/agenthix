#!/usr/bin/env bash
# Keep a local copy current before the dev servers start (dependency-updates unit).
#
#   - Fetches origin; when the checked-out branch is behind its upstream, stops:
#     "This branch is behind GitHub: pull first". It never pulls, rebases or
#     resets, so local work is never moved behind anyone's back. No upstream, no
#     network or a detached head: says so in one line and carries on.
#   - In each module with a package-lock.json that has been installed on this
#     machine, runs `npm install` when the lockfile is newer than npm's own record
#     of the install (node_modules/.package-lock.json). A module with no
#     node_modules is left alone.
#   - Says so in one line when .nvmrc names a different Node from the one running.
#
# Called first by hq/scripts/dev/start.sh and by the "[dev:site] Start" task, so
# "[dev] Start All" runs it for both; the two runs take turns (a lock), so the
# second finds the installs done.
#
# Override, for testing against a copy: FRESH_ROOT.
set -euo pipefail

ROOT="${FRESH_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
MODULES=(. hq site host console console-web ui core relay tests/cross-app)

LOCK="${TMPDIR:-/tmp}/agenthix-fresh-$(printf '%s' "$ROOT" | cksum | cut -d' ' -f1).lock"
waited=0
until mkdir "$LOCK" 2>/dev/null; do
  waited=$((waited + 1))
  if [ "$waited" -gt 600 ]; then rm -rf "$LOCK"; fi
  sleep 1
done
trap 'rm -rf "$LOCK"' EXIT

branch="$(git -C "$ROOT" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
if [ -z "$branch" ]; then
  echo "fresh: detached head, not checking whether GitHub has newer commits."
elif ! upstream="$(git -C "$ROOT" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
  echo "fresh: $branch has no upstream, not checking whether GitHub has newer commits."
elif ! GIT_TERMINAL_PROMPT=0 git -C "$ROOT" fetch --quiet origin 2>/dev/null; then
  echo "fresh: could not reach GitHub, not checking whether this branch is behind."
else
  behind="$(git -C "$ROOT" rev-list --count "HEAD..$upstream")"
  if [ "$behind" -gt 0 ]; then
    echo "This branch is behind GitHub: pull first ($branch is $behind commit(s) behind $upstream)." >&2
    exit 1
  fi
fi

for m in "${MODULES[@]}"; do
  dir="$ROOT/$m"
  [ -f "$dir/package-lock.json" ] || continue
  [ -d "$dir/node_modules" ] || continue
  record="$dir/node_modules/.package-lock.json"
  if [ ! -f "$record" ] || [ "$dir/package-lock.json" -nt "$record" ]; then
    if [ "$m" = hq ] && [ ! -d "$dir/.wasp/out" ] && [ -f "$dir/scripts/install.sh" ]; then
      # Without Wasp's generated code, a plain install drops its packages from hq's lockfile.
      echo "fresh: package-lock.json changed in $m, running hq/scripts/install.sh."
      bash "$dir/scripts/install.sh"
    else
      echo "fresh: package-lock.json changed in $m, running npm install."
      (cd "$dir" && npm install)
    fi
    # npm leaves its record alone when nothing needed changing; mark the lockfile as seen.
    [ -f "$record" ] && touch "$record"
  fi
done

if [ -f "$ROOT/.nvmrc" ]; then
  want="$(tr -d 'v \r\n' <"$ROOT/.nvmrc")"
  have="$(node -v 2>/dev/null | tr -d 'v' || true)"
  case "$have" in
    "$want" | "$want".*) ;;
    *) echo "fresh: .nvmrc names Node $want but this is Node ${have:-none}; switch (nvm use) before relying on this install." ;;
  esac
fi
