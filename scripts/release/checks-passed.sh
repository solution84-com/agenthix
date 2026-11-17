#!/usr/bin/env bash
# Waits for a commit's Checks (checks.yml) to pass, by its one verdict, the check run "All checks passed":
#   scripts/release/checks-passed.sh <commit> [<wait-minutes>]
# Exits 0 once it passed; 1 when it finished without passing, or did not finish within the wait (60 minutes by default).
# Checks runs on main, on release branches and on pull requests, so a commit none of them had finds none and waits it
# out. Needs gh, with GH_TOKEN, and GITHUB_REPOSITORY (owner/name). Release (release.yml) runs it.
set -uo pipefail
commit="${1:-}"
wait_minutes="${2:-60}"
[ -n "$commit" ] || { echo "Usage: $0 <commit> [<wait-minutes>]" >&2; exit 2; }
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY (owner/name) is not set.}"

deadline=$(( $(date +%s) + wait_minutes * 60 ))
for (( ; ; )); do
  states="$(gh api "repos/$GITHUB_REPOSITORY/commits/$commit/check-runs?check_name=All%20checks%20passed" \
    --jq '[.check_runs[] | .status + ":" + (.conclusion // "")] | join(" ")')" || states=""
  echo "All checks passed, for $commit: ${states:-none yet}"
  if [[ " $states " == *" completed:success "* ]]; then exit 0; fi
  if [ -n "$states" ] && [[ "$states" != *queued* ]] && [[ "$states" != *in_progress* ]]; then
    echo "::error::Checks did not pass for $commit. Fix it on the release branch, push the fix, and start Release again."
    exit 1
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::error::Checks did not finish for $commit within $wait_minutes minutes. Start Release again once they pass."
    exit 1
  fi
  sleep 30
done
