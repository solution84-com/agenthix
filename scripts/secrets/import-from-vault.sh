#!/usr/bin/env bash
# Writes this repository's secrets files from the team's KeePassXC vault into this checkout: on a new machine, or to
# take a teammate's change. A file already here is left alone unless --force, which keeps a copy as <file>.bak first (a
# <file>.bak already there is kept: the new copy is <file>.bak.<date and time>).
#
#   scripts/secrets/import-from-vault.sh [<file>…] [--force]    every file, or those named
#
# Which secrets the files hold, and where each comes from: each file's `.example`.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/vault-common.sh"

for line in ${selected[@]+"${selected[@]}"}; do
  file="${line%%|*}" entry="$GROUP/${line#*|}" dest="$ROOT/${line%%|*}"
  if [ -e "$dest" ] && [ "$FORCE" = 0 ]; then echo "  $file: already here, left alone (--force to replace it)"; continue; fi
  notes="$(kp show -a Notes "$entry" 2>/dev/null || true)"
  [ -n "$notes" ] || { echo "  $entry: nothing kept, skipped"; continue; }
  if [ -e "$dest" ]; then
    # An earlier backup holds an older file; it is kept, and this one gets a name of its own.
    bak="$dest.bak"; [ ! -e "$bak" ] || bak="$dest.bak.$(date +%Y%m%d%H%M%S)"
    cp -p "$dest" "$bak"
  fi
  mkdir -p -m 700 "$(dirname "$dest")"
  if [ "${notes%%$'\n'*}" = "base64:" ]; then (umask 077; printf '%s\n' "${notes#*$'\n'}" | base64 --decode > "$dest")
  else (umask 077; printf '%s\n' "$notes" > "$dest"); fi
  echo "  $entry → $file"
done
