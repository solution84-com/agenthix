#!/usr/bin/env bash
# Starts one image and passes only if it starts and answers, so an image that cannot start is never published:
#   scripts/images/start-test.sh <part> <image>
# <part> is one of the parts the release publishes: host, console, hq-server, hq-web, site-server, agent, executor.
# An image carries no version: the host service and the Fleet Console are given theirs when they run, so here each
# need only answer.
#
# What it asks of each:
#   host         its status, through its CLI on the owner socket (`status`), with a state folder of its own
#   console      its status, from inside its container, where it listens
#   hq-server    its health, against a throwaway Postgres
#   site-server  its health, against a throwaway Postgres
#   hq-web       its page
#   agent        its harnesses' versions, run hardened (read-only root, writable /tmp and /home/agent, no capabilities),
#                the launcher, and its tools-stage-key label
#   executor     as a step runs it (read-only root, no network, no capabilities): uid 1001, gh and push-bundle
#                present, no credential helper in any git config, and none of the agent image's files
#
# Everything it makes is named from one prefix of its own for the run (`imgtest-<part>-<pid>`), and everything it
# made, and only that, is removed when it ends, whether it passes or not: it never touches another container,
# network or volume, publishes no port, mounts no Docker socket and removes no image.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2

PART="${1:-}"
IMAGE="${2:-}"
case "$PART" in
  host | console | hq-server | hq-web | site-server | agent | executor) ;;
  *) echo "Usage: $0 <host|console|hq-server|hq-web|site-server|agent|executor> <image>" >&2; exit 2 ;;
esac
[ -n "$IMAGE" ] || { echo "Usage: $0 $PART <image>" >&2; exit 2; }

RUN="imgtest-$PART-$$"
# The host service's namespace: lower-case letters and digits, never the default install's, so whatever it would
# name carries the run's own prefix.
NS="imgtest$$"
TIMEOUT="${START_TEST_TIMEOUT:-180}"
containers=()
network=""
state=""

say() { echo "start test, $PART: $*"; }
fail() {
  say "FAILS: $*"
  for c in ${containers[@]+"${containers[@]}"}; do
    echo "--- logs of $c ---"
    docker logs --tail 80 "$c" 2>&1
  done
  exit 1
}

cleanup() {
  if [ -n "$state" ] && [ "${#containers[@]}" -gt 0 ]; then
    # What the host service wrote belongs to root on a Linux machine, so it is removed from inside.
    docker exec "${containers[0]}" sh -c 'rm -rf /state/* /state/.[!.]*' > /dev/null 2>&1
  fi
  for c in ${containers[@]+"${containers[@]}"}; do docker rm -f -v "$c" > /dev/null 2>&1; done
  [ -n "$network" ] && docker network rm "$network" > /dev/null 2>&1
  [ -n "$state" ] && rm -rf "$state"
}
trap cleanup EXIT

start() {
  local name="$1"; shift
  containers+=("$name")
  docker run -d --name "$name" "$@" > /dev/null || fail "$name did not start"
}

running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = true ]; }

# Runs the check given until it passes, while the container is still running, for up to $TIMEOUT seconds.
wait_for() {
  local container="$1" what="$2"; shift 2
  local deadline=$((SECONDS + TIMEOUT))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if "$@" > /dev/null 2>&1; then return 0; fi
    running "$container" || fail "$container stopped before $what"
    sleep 1
  done
  fail "$what, within ${TIMEOUT}s"
}

secret() { head -c 32 /dev/urandom | base64 | tr -d '\n'; }

# A throwaway Postgres on the run's own network, the same image a host service installs, fixed by digest.
postgres() {
  local pg
  pg="$(sed -nE "s/^export const POSTGRES_IMAGE = '([^']+)'.*/\1/p" host/src/images/published.ts)"
  [ -n "$pg" ] || fail "no Postgres image named in host/src/images/published.ts"
  network="$RUN"
  docker network create "$network" > /dev/null || fail "the network $network could not be made"
  DB_PASSWORD="$(secret | tr -dc 'A-Za-z0-9')"
  start "$RUN-db" --network "$network" -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB=startup "$pg"
  wait_for "$RUN-db" "Postgres answered" docker exec "$RUN-db" pg_isready -U postgres -d startup
  DATABASE_URL="postgresql://postgres:$DB_PASSWORD@$RUN-db:5432/startup"
}

# GET <url> from inside <container> with its own Node, printing the body; fails unless the answer is 200.
fetch_inside() {
  docker exec "$1" node -e "fetch(process.argv[1]).then(async r => { const b = await r.text(); process.stdout.write(b); process.exit(r.status === 200 ? 0 : 1) }, () => process.exit(1))" "$2"
}

docker image inspect "$IMAGE" >/dev/null 2>&1 || { say "FAILS: there is no image $IMAGE on this machine"; exit 1; }

case "$PART" in
  host)
    state="$(mktemp -d)"
    start "$NS-host" -e INSTALL_NAMESPACE="$NS" -v "$state:/state" "$IMAGE"
    host_answers() { docker exec "$NS-host" agenthix status | grep -qF "host service "; }
    wait_for "$NS-host" "it answered its status on the owner socket" host_answers
    say "passes: answers on its owner socket as a host service"
    ;;
  console)
    # An address on the container's own loopback, where nothing answers: the console starts and keeps dialling.
    start "$RUN" -e CONSOLE_HQ_ADDRESS=http://127.0.0.1:9 "$IMAGE"
    console_answers() { fetch_inside "$RUN" http://127.0.0.1:4301/api/status | grep -qF "\"version\":"; }
    wait_for "$RUN" "it answered its status" console_answers
    say "passes: answers its status"
    ;;
  hq-server)
    postgres
    start "$RUN" --network "$network" -e PORT=4101 -e DATABASE_URL="$DATABASE_URL" \
      -e WASP_SERVER_URL=http://localhost:4100 -e WASP_WEB_CLIENT_URL=http://localhost:4100 \
      -e JWT_SECRET="$(secret)" -e SECRETS_MASTER_KEY="$(secret)" -e HQ_STORAGE_ROOT=/hq-storage "$IMAGE"
    hq_healthy() { fetch_inside "$RUN" http://127.0.0.1:4101/health | grep -qF '"status":"ok"'; }
    wait_for "$RUN" "it answered its health" hq_healthy
    say "passes: migrated its database and answers its health"
    ;;
  site-server)
    postgres
    start "$RUN" --init --network "$network" -e PORT=4201 -e DATABASE_URL="$DATABASE_URL" \
      -e SITE_ROOT=/site-data -e SECRETS_MASTER_KEY="$(secret)" "$IMAGE"
    site_healthy() { fetch_inside "$RUN" http://127.0.0.1:4201/health | grep -qF '"status":"ok"'; }
    wait_for "$RUN" "it answered its health" site_healthy
    say "passes: migrated its database and answers its health"
    ;;
  hq-web)
    start "$RUN" -e HQ_URL=http://localhost:4100 "$IMAGE"
    web_page() { docker exec "$RUN" wget -qO- http://127.0.0.1:4100/ | grep -qE '<script[^>]+src="/[^"]+\.js"'; }
    wait_for "$RUN" "it served its page" web_page
    say "passes: serves the browser app's page"
    ;;
  agent)
    # As the site runs it: under Docker's init, on no network, hardened (read-only root, a writable /tmp and
    # /home/agent, no capabilities). The folder arguments match site/src/agents/runtime/containerRunArgs.ts.
    containers+=("$RUN")
    # shellcheck disable=SC2016 # the script is for the container's shell, not this one
    check='
      claude --version && opencode --version
      test "$(id -u)" = 1001 || { echo "it does not run as uid 1001"; exit 1; }
      touch /tmp/w /home/agent/w || { echo "/tmp or /home/agent is not writable"; exit 1; }
      ! touch /usr/local/w 2> /dev/null || { echo "the root is writable"; exit 1; }
      test "$(grep ^CapEff /proc/self/status | tr -d "[:space:]")" = CapEff:0000000000000000 || { echo "a capability is held"; exit 1; }
      /usr/local/lib/agenthix/bin/agenthix-contain /bin/true || { echo "the launcher does not run"; exit 1; }
    '
    out="$(docker run --name "$RUN" --init --network none --read-only --tmpfs /tmp:rw,nosuid,nodev,size=64m,mode=1777 \
      --tmpfs /home/agent:rw,nosuid,nodev,size=64m,uid=1001,gid=1001,mode=0700 --cap-drop ALL \
      --security-opt no-new-privileges "$IMAGE" sh -c "$check" 2>&1)" \
      || fail "its harnesses did not run hardened: $out"
    tools_key="$(docker image inspect -f '{{index .Config.Labels "tools-stage-key"}}' "$IMAGE" 2>/dev/null)"
    [ "$tools_key" = "$(node scripts/images/keys.mjs --worktree --tools-key)" ] \
      || fail "its tools-stage-key label is '$tools_key', not the tools stage's key (build it with --label tools-stage-key=<key>)"
    say "passes: with $(printf '%s' "$out" | tr '\n' ' ')"
    ;;
  executor)
    # As the site starts a step: read-only root, a writable /tmp, no network, no capabilities.
    containers+=("$RUN")
    # shellcheck disable=SC2016 # the script is for the container's shell, not this one
    check='
      test "$(id -u)" = 1001 || { echo "it does not run as uid 1001"; exit 1; }
      gh --version | head -n 1
      command -v push-bundle > /dev/null || { echo "push-bundle is missing"; exit 1; }
      test -z "$(git config --show-origin --get-all credential.helper)" || { echo "git has a credential helper:"; git config --show-origin --get-all credential.helper; exit 1; }
      test ! -e /etc/gitconfig || { echo "there is a system git config"; exit 1; }
      for f in /usr/local/bin/agenthix-git-credential /usr/local/lib/agenthix /usr/local/bin/claude /usr/local/bin/opencode; do
        test ! -e "$f" || { echo "$f is in the executor image"; exit 1; }
      done
      echo "no credential helper, uid 1001"
    '
    out="$(docker run --name "$RUN" --init --network none --read-only --tmpfs /tmp:rw,size=64m --cap-drop ALL \
      --security-opt no-new-privileges "$IMAGE" sh -c "$check" 2>&1)" \
      || fail "it is not the executor image: $out"
    tools_key="$(docker image inspect -f '{{index .Config.Labels "tools-stage-key"}}' "$IMAGE" 2>/dev/null)"
    [ "$tools_key" = "$(node scripts/images/keys.mjs --worktree --tools-key)" ] \
      || fail "its tools-stage-key label is '$tools_key', not the tools stage's key (build it with --label tools-stage-key=<key>)"
    say "passes: $(printf '%s' "$out" | tr '\n' ' ')"
    ;;
esac
