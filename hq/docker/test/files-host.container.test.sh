#!/bin/sh
# hq-web's routing for files (adr-0114, adr-0153) against a real Docker: on files.localhost only a ticket under /t/ and
# the PDF viewer under /viewer/pdf go anywhere (to the relay); on HQ's own host the bare prefix /relay/ and /relay-line go to the relay and /file-link to
# hq-server; no upload path goes to hq-server on either host, since it serves no file. hq-server is stood in by a small
# server that answers with the host and path it was asked for, and hq's relay by another. Run at the repository root:
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
  docker rm -f "$RUN-web" "$RUN-server" "$RUN-relay" > /dev/null 2>&1
  docker network rm "$RUN" > /dev/null 2>&1
  [ -n "${HQ_WEB_IMAGE:-}" ] || docker image rm "$IMAGE" > /dev/null 2>&1
}
trap cleanup EXIT

if [ -z "$IMAGE" ]; then
  IMAGE="$RUN-image"
  docker build ${GH_TOKEN:+--secret id=github_token,env=GH_TOKEN} -f hq/docker/Dockerfile --target web -t "$IMAGE" . || { echo "FAILS: the image does not build"; exit 1; }
fi

docker network create "$RUN" > /dev/null
docker run -d --name "$RUN-server" --network "$RUN" --network-alias hq-server node:24.22.3-alpine3.23 \
  node -e "require('node:http').createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/plain' }); s.end('hq-server ' + q.headers.host + q.url) }).listen(4101)" > /dev/null

docker run -d --name "$RUN-relay" --network "$RUN" --network-alias relay node:24.22.3-alpine3.23 \
  node -e "require('node:http').createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/plain' }); s.end('relay ' + q.headers.host + q.url) }).listen(4401)" > /dev/null

docker run -d --name "$RUN-web" --network "$RUN" -e HQ_URL="http://localhost:$PORT" -p "127.0.0.1:$PORT:4100" "$IMAGE" > /dev/null
up=1
for _ in $(seq 1 50); do
  if curl -fsS "http://127.0.0.1:$PORT/" -H "Host: localhost:$PORT" > /dev/null 2>&1; then up=0; break; fi
  sleep 0.2
done
check "starts with a localhost address" $up
docker logs "$RUN-web" 2>&1 | grep -q 'files are opened on files.localhost'; check "says it opens files on files.localhost" $?

files() { curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$1" -H "Host: files.localhost:$PORT"; }
files_body() { curl -s "http://127.0.0.1:$PORT$1" -H "Host: files.localhost:$PORT"; }

[ "$(files '/')" = 404 ]; check "serves no app on the files host" $?
[ "$(files '/operations/get-me')" = 404 ] && [ "$(files '/auth/me')" = 404 ] && [ "$(files '/file-link?path=x')" = 404 ]
check "forwards nothing of HQ's on the files host" $?
[ "$(files '/files/task/t1/u1/plan.pdf')" = 404 ] && [ "$(files '/org/images/c.png')" = 404 ] \
  && [ "$(files '/agents/a1/images/x.png')" = 404 ] && [ "$(files '/people/p1/images/x.png')" = 404 ] \
  && [ "$(files '/teams/t1/images/x.png')" = 404 ] && [ "$(files '/relay/t/a.b.c')" = 404 ]
check "forwards no upload path, nor the bare prefix, on the files host" $?

[ "$(files_body '/t/a.b.c')" = "relay files.localhost:$PORT/t/a.b.c" ]
check "forwards a ticket on the files host to the relay, host intact" $?
[ "$(files_body '/viewer/pdf')" = "relay files.localhost:$PORT/viewer/pdf" ] \
  && [ "$(files_body '/viewer/pdf/pdf.worker.mjs')" = "relay files.localhost:$PORT/viewer/pdf/pdf.worker.mjs" ]
check "forwards the PDF viewer page and its files on the files host to the relay, host intact" $?
[ "$(files '/viewer/other')" = 404 ] && [ "$(files '/viewer/pdfx')" = 404 ]
check "forwards nothing else under /viewer on the files host" $?
[ "$(files '/relay-line')" = 404 ] && [ "$(files '/t')" = 404 ]
check "forwards the relay's line, and anything but a ticket, nowhere on the files host" $?

page="$(curl -s "http://127.0.0.1:$PORT/" -H "Host: localhost:$PORT")"
printf '%s' "$page" | grep -q '<script'; check "still serves the app on HQ's own host" $?
[ "$(curl -s "http://127.0.0.1:$PORT/file-link?path=x" -H "Host: localhost:$PORT")" = "hq-server localhost:$PORT/file-link?path=x" ]
check "forwards the link route on HQ's own host" $?
for p in /files/task/t1/u1/plan.pdf /org/images/c.png /agents/a1/images/x.png /people/p1/images/x.png /teams/t1/images/x.png; do
  case "$(curl -s "http://127.0.0.1:$PORT$p" -H "Host: localhost:$PORT")" in hq-server*|relay*) bad=1 ;; esac
done
[ "${bad:-0}" -eq 0 ]; check "forwards no upload path on HQ's own host to hq-server or the relay" $?
[ "$(curl -s "http://127.0.0.1:$PORT/relay/t/a.b.c" -H "Host: localhost:$PORT")" = "relay localhost:$PORT/relay/t/a.b.c" ]
check "forwards the bare prefix on HQ's own host to the relay, unchanged, host intact" $?

[ "$(curl -s "http://127.0.0.1:$PORT/relay-line" -H "Host: localhost:$PORT")" = "relay localhost:$PORT/relay-line" ]
check "forwards the relay's line on HQ's own host to the relay" $?
[ "$(curl -s "http://127.0.0.1:$PORT/t/a.b.c" -H "Host: localhost:$PORT")" != "relay localhost:$PORT/t/a.b.c" ]
check "does not forward a ticket's path on HQ's own host to the relay" $?
case "$(curl -s "http://127.0.0.1:$PORT/viewer/pdf" -H "Host: localhost:$PORT")" in relay*) viewer_on_app=1 ;; *) viewer_on_app=0 ;; esac
[ "$viewer_on_app" -eq 0 ]; check "does not forward the PDF viewer's path on HQ's own host to the relay" $?

[ "$failures" -eq 0 ] && echo "all pass" || { echo "$failures failed"; exit 1; }
