#!/usr/bin/env bash
# Puts this repository's secrets files into the team's KeePassXC vault, after any change to one: each file is one entry
# in the group "Agenthix Platform", its contents word for word in the entry's Notes, so it can be read in KeePassXC (a
# binary file as base64).
#
#   scripts/secrets/export-to-vault.sh [<file>…]    every file, or those named (.env.release)
#
# keepassxc-cli takes Notes only as an argument, so while an entry is written its file's contents are briefly in that
# process's arguments, visible to your other processes.
# Which secrets the files hold, and where each comes from: each file's `.example`.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/vault-common.sh"

kp ls "$GROUP" >/dev/null 2>&1 || kp mkdir "$GROUP" >/dev/null
for line in ${selected[@]+"${selected[@]}"}; do
  file="${line%%|*}" entry="$GROUP/${line#*|}"
  [ -f "$ROOT/$file" ] || { echo "  $file: not in this checkout, skipped"; continue; }
  kp show "$entry" >/dev/null 2>&1 || kp add "$entry" >/dev/null
  # Text as it is; a binary file (a keystore) as base64 under a first line `base64:`, which import turns back.
  if [ ! -s "$ROOT/$file" ] || LC_ALL=C grep -qI . "$ROOT/$file"; then notes="$(cat "$ROOT/$file")"
  else notes="base64:"$'\n'"$(base64 < "$ROOT/$file")"; fi
  kp edit --notes "$notes" "$entry" >/dev/null && echo "  $file → $entry"
done
