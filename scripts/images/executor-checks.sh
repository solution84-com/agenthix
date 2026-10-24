#!/usr/bin/env bash
# Checks `push-bundle` in the executor image, as a workflow step runs it (read-only root, writable /tmp, no network,
# no capabilities), with a dummy token only:
#   scripts/images/executor-checks.sh <executor image>
# Nothing is pushed anywhere: the container has no network. It runs containers named wf-checks-executor-<pid> one at
# a time, each removed when done, and touches nothing else.
# shellcheck disable=SC2016 # the scripts given to the container are for its shell, not this one
set -uo pipefail
IMAGE="${1:-}"
[ -n "$IMAGE" ] || { echo "Usage: $0 <executor image>" >&2; exit 2; }
docker image inspect "$IMAGE" > /dev/null 2>&1 || { echo "There is no image $IMAGE on this machine." >&2; exit 2; }

NAME="wf-checks-executor-$$"
CANARY="canary-token-$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')"
dir="$(mktemp -d)"
trap 'docker rm -f "$NAME" > /dev/null 2>&1; rm -rf "$dir"' EXIT
printf '%s' "$CANARY" > "$dir/token"
chmod 0644 "$dir/token"
failed=0

# step <script>: runs the script in a fresh container, shaped as the site starts a step; prints its output.
step() {
  docker rm -f "$NAME" > /dev/null 2>&1
  docker run --rm --name "$NAME" --init --network none --read-only --tmpfs /tmp:rw,size=64m --cap-drop ALL \
    --security-opt no-new-privileges --memory 2g --cpus 2 \
    -e GITHUB_REPOSITORY_URL=https://github.com/example/repo.git \
    -v "$dir/token:/run/secrets/GITHUB_TOKEN:ro" "$IMAGE" sh -c "$1" 2>&1
}

# expect <name> <pattern> <script>: the script's output matches the pattern and never holds the canary.
expect() {
  local name="$1" pattern="$2" out
  out="$(step "$3")"
  if printf '%s' "$out" | grep -qE -- "$pattern" && ! printf '%s' "$out" | grep -qF -- "$CANARY"; then
    echo "passes: $name"
  else
    echo "FAILS: $name"; printf '%s\n' "$out" | sed 's/^/    /'
    failed=$((failed + 1))
  fi
}

# A bundle of one branch, made in a repository of the step's own under /tmp.
MAKE='cd /tmp && git init -q r && cd r && git -c user.name=t -c user.email=t@example.test commit -q --allow-empty -m one && git branch -M main && git bundle create /tmp/b.bundle main >/dev/null 2>&1; cd /tmp;'

expect "refuses no arguments" "Usage: push-bundle.*Nothing was pushed" 'push-bundle'
expect "refuses a branch that starts with a dash" "not allowed.*Nothing was pushed" "$MAKE push-bundle /tmp/b.bundle -fmain"
expect "refuses a branch that is not a valid ref name" "not a valid branch name.*Nothing was pushed" "$MAKE push-bundle /tmp/b.bundle 'a..b'"
expect "refuses the previous-branch form" "not allowed.*Nothing was pushed" "$MAKE push-bundle /tmp/b.bundle '@{-1}'"
expect "refuses a bundle that is not there" "not a regular file.*Nothing was pushed" 'push-bundle /tmp/none main'
expect "refuses a bundle that lacks the branch" "does not hold the branch.*Nothing was pushed" "$MAKE push-bundle /tmp/b.bundle other"
expect "refuses an address that is not https" "not an https address.*Nothing was pushed" "$MAKE GITHUB_REPOSITORY_URL=ext::sh push-bundle /tmp/b.bundle main"
expect "refuses an address with credentials" "must not hold spaces or credentials.*Nothing was pushed" "$MAKE GITHUB_REPOSITORY_URL=https://u:p@github.com/o/r.git push-bundle /tmp/b.bundle main"
# With no network the push fails at the connection, after the bundle was read: the token appears nowhere in the output.
expect "reaches the push with the bundle read as data, and prints no token" "(Could not resolve|unable to access|Failed to connect|Couldn't resolve)" "$MAKE push-bundle /tmp/b.bundle main"
# A repository whose hooks and config name programs: the bundle's source is not the pushing repository, so none run.
expect "runs no hook or config program of the bundle's source repository" "^ok$" "$MAKE"'
  printf "#!/bin/sh\ntouch /tmp/hook-ran\n" > /tmp/r/.git/hooks/pre-push; chmod +x /tmp/r/.git/hooks/pre-push
  git -C /tmp/r config core.sshCommand "touch /tmp/ssh-ran"
  push-bundle /tmp/b.bundle main > /dev/null 2>&1; test ! -e /tmp/hook-ran && test ! -e /tmp/ssh-ran && echo ok'
expect "has no credential helper in any git config" "^none$" 'test -z "$(git config --show-origin --get-all credential.helper)" && echo none'
expect "has gh, and no harness or launcher" "^ok$" 'gh --version >/dev/null && ! command -v claude && ! command -v opencode && test ! -e /usr/local/lib/agenthix && echo ok'
expect "keeps the token file private to the step: the script never echoes it" "^ok$" "$MAKE"'push-bundle /tmp/b.bundle main > /tmp/o 2>&1; ! grep -rqF "$(cat /run/secrets/GITHUB_TOKEN)" /tmp/o && echo ok'
# The script itself never forces a push.
if docker run --rm --name "$NAME" --network none "$IMAGE" sh -c 'grep -Eq -- "--force|--force-with-lease| \+refs" /usr/local/bin/push-bundle'; then
  echo "FAILS: push-bundle names --force"; failed=$((failed + 1))
else
  echo "passes: push-bundle never forces"
fi

if [ "$failed" -eq 0 ]; then echo "all pass"; else echo "$failed failed"; exit 1; fi
