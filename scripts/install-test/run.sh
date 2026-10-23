#!/usr/bin/env bash
# The install test: the product tested in the shape it is installed in, since a send that froze over plain http at a
# network address once passed every test run at localhost. It is a test installation: it builds every image at `dev`,
# starts a host service of its own, `<namespace>-host` with INSTALL_NAMESPACE set to a namespace it makes up and a
# state folder of its own, runs `agenthix install` at this machine's network address over plain http on free ports it
# chooses, and walks through HQ in a real browser (hq/e2e/install/): the first admin made, a message sent to a stand-in model
# (no real model is called), a conversation opened, the Fleet Console opened. Then it removes only what it made.
# Setup's speech providers cannot be checked with their vendors from a test: the walkthrough answers that call and
# puts each provider in the install's database from inside its hq-server container (speech-provider.cjs), so no
# database address or secrets key is read out of the install.
#
#   scripts/install-test/run.sh
#
# A host service built here (`dev`) is the one kind that runs images built here, so no signature check is bypassed.
# It runs beside whatever else is installed here: the host service's own check refuses a port or address block
# another installation holds. It refuses, touching nothing, when a port it was told to use is taken. Settings, all
# optional:
#   INSTALL_TEST_IP            the network address to install at (found from the machine's own when unset)
#   INSTALL_TEST_HQ_PORT       HQ's port; INSTALL_TEST_CONSOLE_PORT the Fleet Console's (on 127.0.0.1);
#                              INSTALL_TEST_MODEL_PORT the stand-in model's. Each is a free port chosen when unset.
#   INSTALL_TEST_BUILD=0     use the images already built here instead of building them;
#   INSTALL_TEST_BUILD=start-test  use the image start test's (imgtest/<part>:dev), as the full regression does
#   INSTALL_TEST_KEEP=1      leave everything running afterwards, and say how to remove it
#   INSTALL_TEST_LOGS        where the logs go (a new folder under the system's temporary folder)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOGS="${INSTALL_TEST_LOGS:-$(mktemp -d "${TMPDIR:-/tmp}/install-test-logs.XXXXXX")}"
mkdir -p "$LOGS"

say() { printf '\n== %s\n' "$*"; }
fail() { printf '\nThe install test failed: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || fail 'Docker is not on this machine.'
command -v node >/dev/null || fail 'Node is not on this machine.'

# --- Names, from core's branding module, never written here ----------------------------------------------------
if [ ! -f "$ROOT/core/dist/index.js" ]; then
  say 'Building core, for the image names'
  (cd "$ROOT/core" && npm run build >/dev/null)
fi
core() { node --input-type=module -e "const m = await import('$ROOT/core/dist/index.js'); console.log($1)"; }
CLI="$(core 'm.BRANDING.cliCommand')"
image() { core "m.imageName('$1')"; }
HOST_IMAGE="$(image host)"

# Free ports it chooses from the range a person may choose from, unless told which to use; each is checked before
# anything is touched.
RANGE_FIRST="$(core 'm.CHOSEN_PORT_RANGE.first')"
RANGE_LAST="$(core 'm.CHOSEN_PORT_RANGE.last')"
CHOSEN=()
while IFS= read -r port; do CHOSEN+=("$port"); done < <(node "$ROOT/scripts/install-test/ports.mjs" free 3 "$RANGE_FIRST" "$RANGE_LAST")
HQ_PORT="${INSTALL_TEST_HQ_PORT:-${CHOSEN[0]}}"
CONSOLE_PORT="${INSTALL_TEST_CONSOLE_PORT:-${CHOSEN[1]}}"
MODEL_PORT="${INSTALL_TEST_MODEL_PORT:-${CHOSEN[2]}}"

# A namespace of its own for the run: every name the host service makes starts with it, and nothing else is touched.
NS="hti$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 8 || true)"
[[ "$NS" =~ ^hti[a-z0-9]{8}$ ]] || fail "could not make a namespace (got $NS)."

# --- Refuse before touching anything -----------------------------------------------------------------------------
taken="$(node "$ROOT/scripts/install-test/ports.mjs" taken "$HQ_PORT" "$CONSOLE_PORT" "$MODEL_PORT")"
[ -z "$taken" ] || fail "port $taken is already in use here. Nothing was touched; free it, or choose others with INSTALL_TEST_HQ_PORT, INSTALL_TEST_CONSOLE_PORT and INSTALL_TEST_MODEL_PORT."

if [ -z "${INSTALL_TEST_IP:-}" ]; then
  if command -v ipconfig >/dev/null && [ "$(uname)" = Darwin ]; then
    INSTALL_TEST_IP="$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || true)"
  else
    INSTALL_TEST_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}' | head -1)"
  fi
fi
[[ "${INSTALL_TEST_IP:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "could not find this machine's network address: set INSTALL_TEST_IP."
case "$INSTALL_TEST_IP" in 127.*) fail "$INSTALL_TEST_IP is this machine only; the test needs its network address." ;; esac
ADDRESS="http://$INSTALL_TEST_IP:$HQ_PORT"
MODEL_URL="http://$INSTALL_TEST_IP:$MODEL_PORT/v1"
echo "Namespace $NS; HQ at $ADDRESS; the Fleet Console on 127.0.0.1:$CONSOLE_PORT; the stand-in model at $MODEL_URL; logs in $LOGS"

# --- Every image, at dev ----------------------------------------------------------------------------------------
if [ "${INSTALL_TEST_BUILD:-1}" = start-test ]; then
  # The images the image start test just built (scripts/images/start-test-all.sh), so a regression builds each once.
  for part in hq-server hq-web site-server agent console host; do
    docker image inspect "imgtest/$part:dev" >/dev/null 2>&1 \
      || fail "imgtest/$part:dev is not here: run scripts/images/start-test-all.sh first, or leave INSTALL_TEST_BUILD unset."
    docker tag "imgtest/$part:dev" "$(image "$part")"
  done
elif [ "${INSTALL_TEST_BUILD:-1}" != 0 ]; then
  build() { # <part> <Dockerfile> [target]
    say "Building $(image "$1")"
    docker build -f "$ROOT/$2" ${3:+--target "$3"} -t "$(image "$1")" "$ROOT" >"$LOGS/build-$1.log" 2>&1 \
      || { tail -40 "$LOGS/build-$1.log" >&2; fail "the image $(image "$1") did not build."; }
  }
  build hq-server hq/docker/Dockerfile server
  build hq-web hq/docker/Dockerfile web
  build site-server site/docker/Dockerfile server
  build agent site/docker/agent.Dockerfile
  build console console/docker/Dockerfile console
  build host host/docker/Dockerfile host
fi

# --- Tear down only what it made --------------------------------------------------------------------------------
STATE="$(mktemp -d "${TMPDIR:-/tmp}/install-test-state.XXXXXX")"
MODEL_PID=''
ours() { # <containers|volumes|networks>: the names that carry the namespace
  case "$1" in
    containers) docker ps --all --format '{{.Names}}' ;;
    volumes) docker volume ls --format '{{.Name}}' ;;
    networks) docker network ls --format '{{.Name}}' ;;
  esac | grep -E "^$NS-" || true
}
teardown() {
  local status=$?
  [ -n "$MODEL_PID" ] && kill "$MODEL_PID" 2>/dev/null || true
  for c in $(ours containers); do docker logs "$c" >"$LOGS/container-$c.log" 2>&1 || true; done
  if [ "${INSTALL_TEST_KEEP:-0}" = 1 ]; then
    echo "Kept. To remove it: the containers, volumes and networks whose names start with $NS-, the firewall table" \
      "${NS}_agents, and $STATE."
    exit "$status"
  fi
  say "Removing what the test made ($NS)"
  for c in $(ours containers); do docker rm -f "$c" >/dev/null 2>&1 || true; done
  for v in $(ours volumes); do docker volume rm -f "$v" >/dev/null 2>&1 || true; done
  for n in $(ours networks); do docker network rm "$n" >/dev/null 2>&1 || true; done
  # The agent protections' firewall table is the namespace's own; the state folder's files are the container's.
  docker run --rm --network host --cap-add NET_ADMIN --entrypoint nft "$HOST_IMAGE" delete table inet "${NS}_agents" >/dev/null 2>&1 || true
  docker run --rm -v "$STATE:/state" --entrypoint sh "$HOST_IMAGE" -c 'rm -rf /state/* /state/.[!.]*' >/dev/null 2>&1 || true
  rm -rf "$STATE"
  left="$(ours containers; ours volumes; ours networks)"
  [ -z "$left" ] || echo "Not removed, remove by hand: $left" >&2
  echo "Logs: $LOGS"
  exit "$status"
}
trap teardown EXIT

# --- The host service, under the test's namespace ---------------------------------------------------------------
say 'Starting the host service'
docker run -d --name "$NS-host" \
  -v /var/run/docker.sock:/var/run/docker.sock -v "$STATE:/state" \
  -v "$NS-host-figures:/run/host-figures" -e TZ=UTC -e INSTALL_NAMESPACE="$NS" \
  --network host --cap-add NET_ADMIN \
  --label "com.docker.compose.project=$NS-host" "$HOST_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NS-host" "$CLI" status >/dev/null 2>&1 && break
  sleep 2
done
docker exec "$NS-host" "$CLI" status >/dev/null 2>&1 || fail 'the host service did not answer.'

say 'Starting the stand-in model'
node "$ROOT/scripts/install-test/stand-in-model.mjs" "$MODEL_PORT" "$LOGS/model.log" >"$LOGS/model-server.log" 2>&1 &
MODEL_PID=$!

say "Installing at $ADDRESS"
docker exec "$NS-host" "$CLI" install --address "$ADDRESS" --hq-port "$HQ_PORT" --console-port "$CONSOLE_PORT" --yes 2>&1 | tee "$LOGS/install.txt"
# The install wraps its words at the terminal's width, so the lines are joined before looking.
tr -s ' \n' ' ' < "$LOGS/install.txt" | grep -q 'Voice and dictation do not work at this address' \
  || fail 'the install did not say that voice and dictation need https or localhost at this address.'
LINK="$(grep -Eo 'https?://[^ ]+/invite/[^ ]+' "$LOGS/install.txt" | head -1 || true)"
[ -n "$LINK" ] || fail 'the install printed no link for the first account.'
HQ_SERVER="$NS-hq-server"
docker inspect "$HQ_SERVER" >/dev/null 2>&1 || fail "the install made no container $HQ_SERVER."

say 'Walking through HQ in a browser'
(cd "$ROOT/hq" && INSTALL_TEST_HQ="$ADDRESS" INSTALL_TEST_LINK="$LINK" INSTALL_TEST_MODEL="$MODEL_URL" \
  INSTALL_TEST_HQ_SERVER="$HQ_SERVER" INSTALL_TEST_CONSOLE="http://127.0.0.1:$CONSOLE_PORT" npx playwright test --project install --workers 1 --output "$LOGS/playwright")

replies="$(grep -c 'POST /chat/completions' "$LOGS/model.log" 2>/dev/null || true)"
echo "The stand-in model answered ${replies:-0} chat requests; no real model was called."
say 'The install test passed'
