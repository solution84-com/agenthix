#!/usr/bin/env bash
# Starts one image and passes only if it starts and answers, so an image that cannot start is never published:
#   scripts/images/start-test.sh <part> <image> [<version>]
# <part> is one of the parts the release publishes: host, console, hq-server, hq-web, site-server, agent.
# <version>, when given, is the version the image must carry in its label (and, for the host service and the Fleet
# Console, the one it reports); without it the label must merely be there.
#
# What it asks of each:
#   host         its version, through its CLI on the owner socket (`status`), with a state folder of its own
#   console      its status, from inside its container, where it listens
#   hq-server    its health, against a throwaway Postgres
#   site-server  its health, against a throwaway Postgres
#   hq-web       its page
#   agent        its harnesses' versions
#
# Everything it makes is named from one prefix of its own for the run (`imgtest-<part>-<pid>`), and everything it
# made, and only that, is removed when it ends, whether it passes or not: it never touches another container,
# network or volume, publishes no port, mounts no Docker socket and removes no image.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2

PART="${1:-}"
IMAGE="${2:-}"
VERSION="${3:-}"
case "$PART" in
  host | console | hq-server | hq-web | site-server | agent) ;;
  *) echo "Usage: $0 <host|console|hq-server|hq-web|site-server|agent> <image> [<version>]" >&2; exit 2 ;;
esac
[ -n "$IMAGE" ] || { echo "Usage: $0 $PART <image> [<version>]" >&2; exit 2; }

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

label="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.version"}}' "$IMAGE" 2>/dev/null)" \
  || { say "FAILS: there is no image $IMAGE on this machine"; exit 1; }
[ -n "$label" ] && [ "$label" != '<no value>' ] || fail "the image carries no version label"
[ -z "$VERSION" ] || [ "$label" = "$VERSION" ] || fail "the image is labelled $label, not $VERSION"
expected="${VERSION:-$label}"

case "$PART" in
  host)
    state="$(mktemp -d)"
    printf '{"namespace":"%s","recordedAt":"%s"}' "$NS" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$state/namespace.json"
    start "$NS-host" -v "$state:/state" "$IMAGE"
    host_answers() { docker exec "$NS-host" agenthix status | grep -qF "host service $expected"; }
    wait_for "$NS-host" "it answered its version on the owner socket" host_answers
    say "passes: answers on its owner socket as host service $expected"
    ;;
  console)
    # An address on the container's own loopback, where nothing answers: the console starts and keeps dialling.
    start "$RUN" -e CONSOLE_HQ_ADDRESS=http://127.0.0.1:9 "$IMAGE"
    console_answers() { fetch_inside "$RUN" http://127.0.0.1:4300/api/status | grep -qF "\"version\":\"$expected\""; }
    wait_for "$RUN" "it answered its status" console_answers
    say "passes: answers its status as version $expected"
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
    # As the site runs it: under Docker's init, on no network.
    containers+=("$RUN")
    out="$(docker run --name "$RUN" --init --network none "$IMAGE" sh -c 'claude --version && opencode --version' 2>&1)" \
      || fail "its harnesses did not run: $out"
    say "passes: version $expected, with $(printf '%s' "$out" | tr '\n' ' ')"
    ;;
esac
