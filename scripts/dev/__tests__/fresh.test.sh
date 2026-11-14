#!/usr/bin/env bash
# Checks scripts/dev/fresh.sh against temporary git repositories. Run: bash scripts/dev/__tests__/fresh.test.sh
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILS=0
check() { if [ "$2" -eq 0 ]; then echo "  ok   $1"; else echo "  FAIL $1"; FAILS=$((FAILS + 1)); fi; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
export TMPDIR="$TMP"
mkdir -p "$TMP/bin"
printf '#!/bin/sh\necho "$PWD" >> "$NPM_LOG"\n' >"$TMP/bin/npm"; chmod +x "$TMP/bin/npm"
export NPM_LOG="$TMP/npm.log"

git init -q --bare "$TMP/origin.git"
git init -q -b main "$TMP/work"
W="$TMP/work"
git -C "$W" remote add origin "$TMP/origin.git"
git -C "$W" commit -q --allow-empty -m one
git -C "$W" push -q -u origin main
git clone -q "$TMP/origin.git" "$TMP/other"
git -C "$TMP/other" commit -q --allow-empty -m two
git -C "$TMP/other" push -q origin main

run() { FRESH_ROOT="$W" PATH="$TMP/bin:$PATH" bash "$DIR/fresh.sh" 2>&1; }

msg="$(run)"; rc=$?
[ $rc -ne 0 ] && [[ "$msg" == *"This branch is behind GitHub: pull first"* ]] && [ "$(git -C "$W" rev-list --count HEAD)" = 1 ]
check "a branch behind its upstream stops and does not pull" $?

git -C "$W" pull -q
run >/dev/null; check "an up-to-date branch carries on" $?

git -C "$W" remote set-url origin "$TMP/missing.git"
git -C "$TMP/other" commit -q --allow-empty -m three
msg="$(run)"; rc=$?
[ $rc -eq 0 ] && [[ "$msg" == *"could not reach GitHub"* ]]
check "offline carries on, in one line" $?
git -C "$W" remote set-url origin "$TMP/origin.git"

git -C "$W" checkout -q --detach
msg="$(run)"; rc=$?
[ $rc -eq 0 ] && [[ "$msg" == *"detached head"* ]]
check "a detached head carries on" $?
git -C "$W" checkout -q main

mkdir -p "$W/hq/node_modules" "$W/site" "$W/core/node_modules"
echo '{}' >"$W/hq/package-lock.json"; echo '{}' >"$W/site/package-lock.json"; echo '{}' >"$W/core/package-lock.json"
echo '{}' >"$W/hq/node_modules/.package-lock.json"; echo '{}' >"$W/core/node_modules/.package-lock.json"
touch -t 202001010000 "$W/hq/node_modules/.package-lock.json" "$W/core/node_modules/.package-lock.json"
touch -t 202001020000 "$W/hq/package-lock.json"
touch -t 201901010000 "$W/core/package-lock.json"
: >"$NPM_LOG"
run >/dev/null
[ "$(cat "$NPM_LOG")" = "$W/hq" ]
check "a changed lockfile runs npm install, only there; unchanged and not-installed modules are left alone" $?

: >"$NPM_LOG"
run >/dev/null
[ ! -s "$NPM_LOG" ]
check "a second run, nothing changed, installs nothing" $?

echo 'v99.0.0' >"$W/.nvmrc"
msg="$(run)"; [[ "$msg" == *".nvmrc names Node 99.0.0"* ]]
check "a different Node in .nvmrc is said in one line" $?
exit $FAILS
