#!/usr/bin/env bash
# Starts a workflow by hand (workflow_dispatch) at a branch or tag, and prints the new run's ID:
#   scripts/release/dispatch.sh <workflow file> <branch or tag> [-f <input>=<value> ...]
# The run is the one gh reports when it starts it, or else the newest run of that workflow, started by hand at that
# ref, created after this script began. Release (release.yml) starts Publish release with it, and the VS Code
# tasks start Release with it. Needs gh (with GH_TOKEN on a runner); GITHUB_REPOSITORY (owner/name) names the
# repository when set, as on a runner, and otherwise gh takes the checkout's.
set -uo pipefail
workflow="${1:-}"
ref="${2:-}"
[ -n "$workflow" ] && [ -n "$ref" ] || { echo "Usage: $0 <workflow file> <branch or tag> [-f <input>=<value> ...]" >&2; exit 2; }
shift 2
repo=()
[ -n "${GITHUB_REPOSITORY:-}" ] && repo=(--repo "$GITHUB_REPOSITORY")

started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
out="$(gh workflow run "$workflow" ${repo[@]+"${repo[@]}"} --ref "$ref" "$@" 2>&1)" || { echo "$out" >&2; exit 1; }
echo "$out" >&2
id="$(grep -Eo '/actions/runs/[0-9]+' <<<"$out" | head -n 1 | grep -Eo '[0-9]+$')"

# Older gh, or an API that did not say: the run appears in the list within a few seconds.
for _ in $(seq 1 20); do
  [ -n "$id" ] && break
  sleep 3
  id="$(gh run list ${repo[@]+"${repo[@]}"} --workflow "$workflow" --event workflow_dispatch --branch "$ref" --limit 10 \
    --json databaseId,createdAt --jq "[.[] | select(.createdAt >= \"$started\")] | sort_by(.createdAt) | last | .databaseId // empty")"
done
[ -n "$id" ] || { echo "Started $workflow at $ref, but could not find its run." >&2; exit 1; }
echo "$id"
