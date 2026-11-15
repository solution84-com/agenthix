#!/usr/bin/env bash
# The upgrade test: HQ and its site upgraded as an installation is, against real containers, and the data carried
# through. A development host service of its own, `<namespace>-host`, installs HQ from the images of the version
# before (the previous release, pulled, or images already here), the test puts rows in HQ's database (rows.cjs), and
# `hq upgrade --image-tag` takes it to the candidate's images: the published upgrade's backup, stop, start, health
# check and put-back, without the signature and the fetch. Then the rows must all be there, no table may have lost
# rows, and nothing may be left stopped. Then it upgrades to a build whose hq-server never answers: the health check
# fails, the backup is put back, and the rows and the candidate's images must be back. Last, it erases HQ and
# uninstalls, as a person would, and removes whatever is left of what it made.
#
#   scripts/upgrade-test/run.sh
#
# It runs beside other installations: every container, volume, network, image tag and folder it creates, stops or
# removes carries its namespace, and it refuses to touch anything else (`guard`). It refuses before touching anything
# when the namespace is already in use here, or a port it would publish is taken. Settings, all optional:
#   UPGRADE_TEST_NAMESPACE     the installation's namespace (a new one, hut<random>, when unset)
#   UPGRADE_TEST_HQ_PORT       HQ's port, on 127.0.0.1; UPGRADE_TEST_CONSOLE_PORT the Fleet Console's. Free ports when unset.
#   UPGRADE_TEST_FROM          the version installed first, pulled from UPGRADE_TEST_REGISTRY (the newest release tag
#                              before this commit unless set: `git describe --tags --match 'v*' --abbrev=0`, without the v)
#   UPGRADE_TEST_FROM_TAG      instead: the images here as <image name>:<tag> (agenthix-hq-server:<tag> …)
#   UPGRADE_TEST_FROM_REFS     instead: a file of `<part> <image>` lines, such as images by digest
#   UPGRADE_TEST_TO_TAG        the candidate: the images here as <image name>:<tag>. Unset, the images built from the
#                              working tree (imgtest/<part>:dev, built when missing by scripts/images/start-test-all.sh)
#   UPGRADE_TEST_HOST_IMAGE    the host service's image, a development build (the candidate's host image unless set)
#   UPGRADE_TEST_REGISTRY      where a version is pulled from (ghcr.io/solution84-com unless set)
#   UPGRADE_TEST_NO_BUILD=1    build nothing: a missing image is an error
#   UPGRADE_TEST_KEEP=1        leave everything as it is at the end, and say how to remove it
#   UPGRADE_TEST_LOGS          where the logs go (a new folder under the system's temporary folder)
#   UPGRADE_TEST_HQ_WAIT_SECONDS  how long the host service waits for HQ to answer (90 unless set; a development build's
#                              setting HOST_DEV_HQ_WAIT_SECONDS, which a published host service ignores)
# It installs whole installations, so it is skipped, with one line saying why and exit 0, when either app's migrations
# were squashed after the version installed first (scripts/regression/squashed.mjs): an installation from before a
# squash is reinstalled, not upgraded. From the first release after a squash it runs as before.
# It takes about 5 minutes once the images are built, the forced failure's health check waiting that long for an
# hq-server that never answers (an installation's waits 10 minutes).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/scripts/upgrade-test"
LOGS="${UPGRADE_TEST_LOGS:-$(mktemp -d "${TMPDIR:-/tmp}/upgrade-test-logs.XXXXXX")}"
mkdir -p "$LOGS"
STARTED_AT=$(date +%s)

say() { printf '\n== %s  (%ss)\n' "$*" "$(($(date +%s) - STARTED_AT))"; }
fail() { printf '\nThe upgrade test failed: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || fail 'Docker is not on this machine.'
command -v node >/dev/null || fail 'Node is not on this machine.'

# --- Names, from core's branding module, never written here -----------------------------------------------------
if [ ! -f "$ROOT/core/dist/index.js" ]; then
  say 'Building core, for the image names'
  (cd "$ROOT/core" && npm run build >/dev/null)
fi
core() { node --input-type=module -e "const m = await import('$ROOT/core/dist/index.js'); console.log($1)"; }
CLI="$(core 'm.BRANDING.cliCommand')"
PREFIX="$(core 'm.BRANDING.imagePrefix')"
DEFAULT_NS="$(core 'm.DEFAULT_INSTALL_NAMESPACE')"
image() { core "m.imageName('$1')"; }
# What an installation runs, the host service aside: HQ's images, the site's and the Fleet Console's.
PARTS="hq-server hq-web relay site-server agent executor console"

NS="${UPGRADE_TEST_NAMESPACE:-hut$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 8 || true)}"
[[ "$NS" =~ ^[a-z][a-z0-9-]{0,30}$ ]] || fail "\"$NS\" cannot be a namespace: lower-case letters, digits and hyphens, starting with a letter."
[ "$NS" != "$DEFAULT_NS" ] || fail "the test never runs as $DEFAULT_NS, an installation's own namespace."

# --- The guard: nothing is created, stopped or removed unless its name carries the namespace ------------------------
owned() { case "$1" in "$NS"-* | *:"$NS"-* | "${NS}_agents") return 0 ;; *) return 1 ;; esac; }
guard() { for name in "$@"; do owned "$name" || fail "refusing to touch $name: its name does not carry the namespace $NS."; done; }
ours() { # <containers|volumes|networks|tags>: what here carries the namespace
  case "$1" in
    containers) docker ps --all --format '{{.Names}}' | grep -E "^$NS-" ;;
    volumes) docker volume ls --format '{{.Name}}' | grep -E "^$NS-" ;;
    networks) docker network ls --format '{{.Name}}' | grep -E "^$NS-" ;;
    tags) docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E ":$NS-" ;;
  esac || true
}
tag() { guard "$2"; docker tag "$1" "$2"; }
running_all() { # every container of the installation runs: none created, exited or restarting
  local stopped
  stopped="$(docker ps --all --filter "name=^$NS-" --format '{{.Names}} {{.State}}' | grep -v ' running$' | grep -vE "^$NS-host-(launcher|uninstall) " || true)"
  [ -z "$stopped" ] || fail "left not running: $stopped"
}

# --- Refuse before touching anything ------------------------------------------------------------------------------
[ -z "$(ours containers)$(ours volumes)$(ours networks)" ] || fail "the namespace $NS is in use here already (containers, volumes or networks named $NS-…). Nothing was touched; remove them, or choose another with UPGRADE_TEST_NAMESPACE."
RANGE_FIRST="$(core 'm.CHOSEN_PORT_RANGE.first')"
RANGE_LAST="$(core 'm.CHOSEN_PORT_RANGE.last')"
CHOSEN=()
while IFS= read -r port; do CHOSEN+=("$port"); done < <(node "$ROOT/scripts/install-test/ports.mjs" free 2 "$RANGE_FIRST" "$RANGE_LAST")
HQ_PORT="${UPGRADE_TEST_HQ_PORT:-${CHOSEN[0]}}"
CONSOLE_PORT="${UPGRADE_TEST_CONSOLE_PORT:-${CHOSEN[1]}}"
taken="$(node "$ROOT/scripts/install-test/ports.mjs" taken "$HQ_PORT" "$CONSOLE_PORT")"
[ -z "$taken" ] || fail "port $taken is already in use here. Nothing was touched; choose others with UPGRADE_TEST_HQ_PORT and UPGRADE_TEST_CONSOLE_PORT."
ADDRESS="http://127.0.0.1:$HQ_PORT"
FROM_VERSION="${UPGRADE_TEST_FROM:-}"
if [ -z "$FROM_VERSION" ] && [ -z "${UPGRADE_TEST_FROM_TAG:-}${UPGRADE_TEST_FROM_REFS:-}" ]; then
  FROM_VERSION="$(git -C "$ROOT" describe --tags --match 'v*' --abbrev=0 2>/dev/null || true)"
  FROM_VERSION="${FROM_VERSION#v}"
  [ -n "$FROM_VERSION" ] || fail 'no release tag (v*) is in this history, so there is no version to upgrade from: fetch the tags (git fetch --tags), or set UPGRADE_TEST_FROM.'
fi
# A squash after the version installed first: nothing to prove. Only a release tag can be compared; images given by
# tag or refs are not, and run as before.
if [ -n "$FROM_VERSION" ]; then
  for app in hq site; do
    squashed="$(node "$ROOT/scripts/regression/squashed.mjs" "v$FROM_VERSION" "$app" 2>/dev/null || true)"
    if [ -n "$squashed" ]; then echo "$squashed"; exit 0; fi
  done
fi
HQ_WAIT="${UPGRADE_TEST_HQ_WAIT_SECONDS:-90}"
[[ "$HQ_WAIT" =~ ^[1-9][0-9]*$ ]] || fail "UPGRADE_TEST_HQ_WAIT_SECONDS is a whole number of seconds, not \"$HQ_WAIT\"."
echo "Namespace $NS; HQ at $ADDRESS; the Fleet Console on 127.0.0.1:$CONSOLE_PORT; logs in $LOGS"

# --- The images ---------------------------------------------------------------------------------------------------
# Each image the test runs is tagged <image name>:<namespace>-from, -to or -broken, so the host service finds them by
# one tag (install --image-tag, hq upgrade --image-tag) and the test removes only its own tags.
PULLED=()
from_ref() { # <part>: the image installed first
  if [ -n "${UPGRADE_TEST_FROM_REFS:-}" ]; then
    awk -v p="$1" '$1 == p { print $2 }' "$UPGRADE_TEST_FROM_REFS"
  elif [ -n "${UPGRADE_TEST_FROM_TAG:-}" ]; then
    echo "$(image "$1"):$UPGRADE_TEST_FROM_TAG"
  else
    echo "${UPGRADE_TEST_REGISTRY:-ghcr.io/solution84-com}/$PREFIX-$1:$FROM_VERSION"
  fi
}
to_ref() { if [ -n "${UPGRADE_TEST_TO_TAG:-}" ]; then echo "$(image "$1"):$UPGRADE_TEST_TO_TAG"; else echo "imgtest/$1:dev"; fi; }

say 'Finding the images'
if [ -z "${UPGRADE_TEST_TO_TAG:-}" ] && [ "${UPGRADE_TEST_NO_BUILD:-0}" != 1 ]; then
  # Builds only a part whose image is missing or was built from other content.
  "$ROOT/scripts/images/start-test-all.sh" $PARTS host >"$LOGS/build.log" 2>&1 || { tail -40 "$LOGS/build.log" >&2; fail 'the images did not build and start.'; }
fi
for part in $PARTS; do
  ref="$(from_ref "$part")"
  [ -n "$ref" ] || fail "UPGRADE_TEST_FROM_REFS names no image for $part."
  if ! docker image inspect "$ref" >/dev/null 2>&1; then
    case "$ref" in */*:* | */*@*) ;; *) fail "the image $ref is not here." ;; esac
    docker pull --quiet "$ref" >/dev/null || fail "the image $ref could not be pulled."
    PULLED+=("$ref")
  fi
  docker image inspect "$(to_ref "$part")" >/dev/null 2>&1 || fail "the candidate's image $(to_ref "$part") is not here."
done
HOST_IMAGE="${UPGRADE_TEST_HOST_IMAGE:-$( [ -n "${UPGRADE_TEST_TO_TAG:-}" ] && echo "$(image host):$UPGRADE_TEST_TO_TAG" || echo imgtest/host:dev)}"
docker image inspect "$HOST_IMAGE" >/dev/null 2>&1 || fail "the host service's image $HOST_IMAGE is not here."
case "$HOST_IMAGE" in */"$PREFIX"-host:*) fail "$HOST_IMAGE is a published host service's name, which would run as that version: the test needs a development build, named locally." ;; esac

# --- Tear down only what it made ----------------------------------------------------------------------------------
STATE="$(mktemp -d "${TMPDIR:-/tmp}/$NS-state.XXXXXX")"
teardown() {
  local status=$?
  for c in $(ours containers); do docker logs "$c" >"$LOGS/container-$c.log" 2>&1 || true; done
  if [ "${UPGRADE_TEST_KEEP:-0}" = 1 ]; then
    echo "Kept. To remove it: the containers, volumes and networks named $NS-…, the image tags :$NS-…, the firewall table ${NS}_agents, and $STATE."
    exit "$status"
  fi
  say "Removing what the test made ($NS)"
  for c in $(ours containers); do guard "$c"; docker rm -f "$c" >/dev/null 2>&1 || true; done
  for v in $(ours volumes); do guard "$v"; docker volume rm -f "$v" >/dev/null 2>&1 || true; done
  for n in $(ours networks); do guard "$n"; docker network rm "$n" >/dev/null 2>&1 || true; done
  docker run --rm --network host --cap-add NET_ADMIN --entrypoint nft "$HOST_IMAGE" delete table inet "${NS}_agents" >/dev/null 2>&1 || true
  docker run --rm -v "$STATE:/state" --entrypoint sh "$HOST_IMAGE" -c 'rm -rf /state/* /state/.[!.]*' >/dev/null 2>&1 || true
  rm -rf "$STATE"
  for t in $(ours tags); do guard "$t"; docker image rm "$t" >/dev/null 2>&1 || true; done
  # An image pulled for the test, which was not here before it; one a container still uses stays.
  for ref in "${PULLED[@]+"${PULLED[@]}"}"; do docker image rm "$ref" >/dev/null 2>&1 || true; done
  left="$(ours containers; ours volumes; ours networks; ours tags)"
  if [ -n "$left" ]; then echo "Not removed, remove by hand: $left" >&2; [ "$status" -ne 0 ] || status=1; fi
  echo "Logs: $LOGS. It took $(($(date +%s) - STARTED_AT)) seconds."
  exit "$status"
}
trap teardown EXIT

for part in $PARTS; do
  tag "$(from_ref "$part")" "$(image "$part"):$NS-from"
  tag "$(to_ref "$part")" "$(image "$part"):$NS-to"
  [ "$part" = hq-server ] || tag "$(to_ref "$part")" "$(image "$part"):$NS-broken"
done
# The forced failure: the candidate's hq-server, never answering.
guard "$(image hq-server):$NS-broken"
printf 'FROM %s\nENTRYPOINT ["sleep", "3600"]\n' "$(image hq-server):$NS-to" | docker build --quiet -t "$(image hq-server):$NS-broken" - >/dev/null

# --- The host service, under the test's namespace -----------------------------------------------------------------
say "Starting the host service ($HOST_IMAGE)"
guard "$NS-host" "$NS-host-figures"
docker run -d --name "$NS-host" \
  -v /var/run/docker.sock:/var/run/docker.sock -v "$STATE:/state" \
  -v "$NS-host-figures:/run/host-figures" -e TZ=UTC -e INSTALL_NAMESPACE="$NS" -e HOST_DEV_HQ_WAIT_SECONDS="$HQ_WAIT" \
  --network host --cap-add NET_ADMIN \
  --label "com.docker.compose.project=$NS-host" "$HOST_IMAGE" >/dev/null
for _ in $(seq 1 60); do docker exec "$NS-host" "$CLI" status >/dev/null 2>&1 && break; sleep 2; done
docker exec "$NS-host" "$CLI" status >/dev/null 2>&1 || fail 'the host service did not answer.'
host_cli() { docker exec -i "$NS-host" "$CLI" "$@"; }
rows() { docker exec -i "$NS-hq-server" node - "$@" <"$HERE/rows.cjs"; }
counts() { rows counts >"$LOGS/counts-$1.json" || fail "the rows could not be counted ($1)."; }
no_rows_lost() { # <before> <after>: no table lost rows, and none went
  node -e '
    const [a, b] = process.argv.slice(1).map(f => JSON.parse(require("fs").readFileSync(f, "utf8")))
    const lost = Object.entries(a).filter(([t, n]) => !(t in b) || b[t] < n).map(([t, n]) => `${t}: ${n} before, ${t in b ? b[t] : "no table"} after`)
    if (lost.length) { console.error(lost.join("\n")); process.exit(1) }
  ' "$LOGS/counts-$1.json" "$LOGS/counts-$2.json" || fail "rows were lost between $1 and $2 (above)."
}
image_of() { docker container inspect --format '{{.Image}}' "$1"; }
id_of() { docker image inspect --format '{{.Id}}' "$1"; }

# --- Install the version before, and put rows in it ---------------------------------------------------------------
say "Installing HQ from $(from_ref hq-server)"
host_cli install --address "$ADDRESS" --hq-port "$HQ_PORT" --console-port "$CONSOLE_PORT" --image-tag "$NS-from" --yes >"$LOGS/install.txt" 2>&1 \
  || { cat "$LOGS/install.txt" >&2; fail 'the install failed.'; }
rows seed one || fail 'the rows could not be seeded.'
running_all
counts installed

# --- Upgrade to the candidate ---------------------------------------------------------------------------------------
say 'Upgrading to the candidate'
host_cli hq upgrade --image-tag "$NS-to" --yes >"$LOGS/upgrade.txt" 2>&1 || { cat "$LOGS/upgrade.txt" >&2; fail 'the upgrade to the candidate did not complete.'; }
[ "$(image_of "$NS-hq-server")" = "$(id_of "$(image hq-server):$NS-to")" ] || fail "hq-server does not run the candidate's image."
[ "$(image_of "$NS-site-server")" = "$(id_of "$(image site-server):$NS-to")" ] || fail "the site does not run the candidate's image."
rows check one || fail 'rows were lost in the upgrade.'
running_all
counts upgraded
no_rows_lost installed upgraded

# --- An upgrade that fails, put back --------------------------------------------------------------------------------
rows seed two || fail 'the second rows could not be seeded.'
counts before-failure
say "Upgrading to a build whose hq-server never answers (the health check waits $HQ_WAIT seconds)"
if host_cli hq upgrade --image-tag "$NS-broken" --yes >"$LOGS/failed-upgrade.txt" 2>&1; then
  fail 'the upgrade to a build that never answers was not put back.'
fi
tr -s ' \n' ' ' <"$LOGS/failed-upgrade.txt" | grep -q 'did not pass its health check' || { cat "$LOGS/failed-upgrade.txt" >&2; fail 'the failed upgrade did not say its health check failed.'; }
tr -s ' \n' ' ' <"$LOGS/failed-upgrade.txt" | grep -q 'runs the images it ran before again' || { cat "$LOGS/failed-upgrade.txt" >&2; fail 'the failed upgrade was not put back.'; }
[ "$(image_of "$NS-hq-server")" = "$(id_of "$(image hq-server):$NS-to")" ] || fail "hq-server does not run the candidate's image again after the put-back."
for _ in $(seq 1 60); do rows check one two >/dev/null 2>&1 && break; sleep 5; done
rows check one two || fail 'rows were lost in the put-back.'
running_all
counts put-back
no_rows_lost before-failure put-back
docker logs "$NS-host" 2>&1 | grep -q 'Upgrade of HQ to the images tagged '"$NS"'-broken: rolled back' || fail "the host service's log does not say the upgrade was rolled back."

# --- Erase and uninstall, as a person would -------------------------------------------------------------------------
say 'Erasing HQ and uninstalling'
SITE_NAME="$(host_cli status | head -1 | sed 's/ ·.*//')"
printf '%s\n' "$ADDRESS" | host_cli hq erase >"$LOGS/erase.txt" 2>&1 || { cat "$LOGS/erase.txt" >&2; fail 'HQ could not be erased.'; }
printf '%s\n%s\n%s\n' "$ADDRESS" "$SITE_NAME" "$ADDRESS" | host_cli uninstall --yes >"$LOGS/uninstall.txt" 2>&1 || { cat "$LOGS/uninstall.txt" >&2; fail 'the uninstall failed.'; }
for _ in $(seq 1 60); do [ -z "$(ours containers)" ] && break; sleep 2; done
[ -z "$(ours containers)$(ours volumes)$(ours networks)" ] || fail "the uninstall left: $(ours containers; ours volumes; ours networks)"
say 'The upgrade test passed'
