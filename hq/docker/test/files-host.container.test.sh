#!/bin/sh
# hq-web's files host (adr-0114) against a real Docker: uploaded files' paths on files.localhost go to hq-server,
# and nothing else does — no app, no API. hq-server is stood in by a small server that answers with the host and
# path it was asked for. Run at the repository root:
#   sh hq/docker/test/files-host.container.test.sh
# It builds the image first unless HQ_WEB_IMAGE names one already built. It uses port 47110 on 127.0.0.1
# (HQ_WEB_TEST_PORT changes it).
set -u
IMAGE="${HQ_WEB_IMAGE:-}"
PORT="${HQ_WEB_TEST_PORT:-47110}"
RUN="hq-web-files-test-$$"
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

docker network create "$RUN" > /dev/null
docker run -d --name "$RUN-server" --network "$RUN" --network-alias hq-server node:24.14.1-alpine3.23 \
  node -e "require('node:http').createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/plain' }); s.end('hq-server ' + q.headers.host + q.url) }).listen(4101)" > /dev/null

docker run -d --name "$RUN-web" --network "$RUN" -e HQ_URL="http://localhost:$PORT" -p "127.0.0.1:$PORT:4100" "$IMAGE" > /dev/null
up=1
for _ in $(seq 1 50); do
  if curl -fsS "http://127.0.0.1:$PORT/" -H "Host: localhost:$PORT" > /dev/null 2>&1; then up=0; break; fi
  sleep 0.2
done
check "starts with a localhost address" $up
docker logs "$RUN-web" 2>&1 | grep -q 'uploaded files are served on files.localhost'; check "says it serves uploads on files.localhost" $?

files() { curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$1" -H "Host: files.localhost:$PORT"; }
files_body() { curl -s "http://127.0.0.1:$PORT$1" -H "Host: files.localhost:$PORT"; }

[ "$(files_body '/agents/a1/images/x.png?u=p&e=1&s=z')" = "hq-server files.localhost:$PORT/agents/a1/images/x.png?u=p&e=1&s=z" ]
check "forwards an agent's picture on the files host to hq-server, host and link intact" $?
[ "$(files '/files/task/t1/u1/plan.pdf')" = 200 ] && [ "$(files '/org/images/c.png')" = 200 ] \
  && [ "$(files '/people/p1/images/x.png')" = 200 ] && [ "$(files '/teams/t1/images/x.png')" = 200 ]
check "forwards every kind of upload on the files host" $?
[ "$(files '/')" = 404 ]; check "serves no app on the files host" $?
[ "$(files '/operations/get-me')" = 404 ] && [ "$(files '/auth/me')" = 404 ] && [ "$(files '/file-link?path=x')" = 404 ]
check "forwards nothing else of HQ's on the files host" $?

page="$(curl -s "http://127.0.0.1:$PORT/" -H "Host: localhost:$PORT")"
printf '%s' "$page" | grep -q '<script'; check "still serves the app on HQ's own host" $?
[ "$(curl -s "http://127.0.0.1:$PORT/file-link?path=x" -H "Host: localhost:$PORT")" = "hq-server localhost:$PORT/file-link?path=x" ]
check "forwards the link route on HQ's own host" $?
[ "$(curl -s "http://127.0.0.1:$PORT/org/images/c.png" -H "Host: localhost:$PORT")" = "hq-server localhost:$PORT/org/images/c.png" ]
check "forwards an upload's path on HQ's host to hq-server, which refuses it there" $?

[ "$failures" -eq 0 ] && echo "all pass" || { echo "$failures failed"; exit 1; }
