#!/bin/sh
# hq-web's image against a real Docker (adr-0111): built once with its placeholder, started with an address, and
# checked that the browser app it serves reaches its server at that address. hq-server is stood in by a small
# server that answers /health, on the private network hq-web forwards to. Run at the repository root:
#   sh hq/docker/test/web-image.container.test.sh
# It builds the image first unless HQ_WEB_IMAGE names one already built. It uses port 47100 on 127.0.0.1
# (HQ_WEB_TEST_PORT changes it).
set -u
IMAGE="${HQ_WEB_IMAGE:-}"
PORT="${HQ_WEB_TEST_PORT:-47100}"
ADDRESS="http://127.0.0.1:$PORT"
RUN="hq-web-test-$$"
failures=0

check() {
  if [ "$2" -eq 0 ]; then echo "passes: $1"; else echo "FAILS: $1"; failures=$((failures + 1)); fi
}

cleanup() {
  docker rm -f "$RUN-web" "$RUN-server" > /dev/null 2>&1
  docker network rm "$RUN" > /dev/null 2>&1
  [ -n "${HQ_WEB_IMAGE:-}" ] || docker image rm "$IMAGE" > /dev/null 2>&1
}
trap cleanup EXIT

if [ -z "$IMAGE" ]; then
  IMAGE="$RUN-image"
  docker build -f hq/docker/Dockerfile --target web -t "$IMAGE" . || { echo "FAILS: the image does not build"; exit 1; }
fi
check "builds once, with the placeholder in the built app" 0

docker network create "$RUN" > /dev/null
docker run -d --name "$RUN-server" --network "$RUN" --network-alias hq-server node:24.14.1-alpine3.23 \
  node -e "require('node:http').createServer((q, s) => { s.writeHead(q.url === '/health' ? 200 : 404, { 'content-type': 'text/plain' }); s.end(q.url === '/health' ? 'hq-server answers' : '') }).listen(4101)" > /dev/null

out="$(docker run --rm "$IMAGE" 2>&1)"; code=$?
[ "$code" -ne 0 ] && printf '%s' "$out" | grep -q 'HQ_URL is not set'; check "refuses to start without HQ_URL" $?
out="$(docker run --rm -e HQ_URL=https://hq.example.com/ "$IMAGE" 2>&1)"; code=$?
[ "$code" -ne 0 ] && printf '%s' "$out" | grep -q 'must not end in a slash'; check "refuses to start with a malformed HQ_URL" $?

docker run -d --name "$RUN-web" --network "$RUN" -e HQ_URL="$ADDRESS" -p "127.0.0.1:$PORT:4100" "$IMAGE" > /dev/null
up=1
for _ in $(seq 1 50); do
  if curl -fsS "$ADDRESS/" > /dev/null 2>&1; then up=0; break; fi
  sleep 0.2
done
check "starts with an address and serves the app" $up

page="$(curl -fsS "$ADDRESS/")"
scripts="$(printf '%s' "$page" | grep -o 'src="/[^"]*\.js"' | sed 's/^src="//; s/"$//')"
[ -n "$scripts" ]; check "the app's page names its scripts" $?
bundle=""
for s in $scripts; do bundle="$bundle$(curl -fsS "$ADDRESS$s")"; done
# The entry names its chunks as "assets/<name>.js", with or without a leading slash.
for chunk in $(printf '%s' "$bundle" | grep -oE '"/?assets/[^"]*\.js"' | tr -d '"' | sed 's#^/##' | sort -u); do bundle="$bundle$(curl -fsS "$ADDRESS/$chunk")"; done
printf '%s' "$bundle" | grep -F "$ADDRESS" > /dev/null; check "the app's scripts hold HQ's address" $?
! printf '%s' "$bundle" | grep -F 'hq-address.invalid' > /dev/null; check "and no placeholder" $?
[ "$(curl -fsS "$ADDRESS/health")" = 'hq-server answers' ]; check "the app reaches its server at that address" $?

docker restart "$RUN-web" > /dev/null
up=1
for _ in $(seq 1 50); do
  if curl -fsS "$ADDRESS/health" > /dev/null 2>&1; then up=0; break; fi
  sleep 0.2
done
check "starts again after a restart" $up
docker logs "$RUN-web" 2>&1 | grep -q "reaches HQ at $ADDRESS"; check "says the address it took" $?

[ "$failures" -eq 0 ] && echo "all pass" || { echo "$failures failed"; exit 1; }
