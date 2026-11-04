#!/usr/bin/env bash
# Checks scripts/dev/ports.sh and require-free-ports.sh. Run: bash scripts/dev/__tests__/ports.test.sh
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILS=0
check() { if [ "$2" -eq 0 ]; then echo "  ok   $1"; else echo "  FAIL $1"; FAILS=$((FAILS + 1)); fi; }

out="$(env -u HQ_WEB_PORT bash "$DIR/ports.sh")"
grep -qx 'HQ_WEB_PORT=4100' <<<"$out" && grep -qx 'SITE_DB_PORT=4209' <<<"$out" && grep -qx 'CONSOLE_SERVER_PORT=4301' <<<"$out" && grep -qx 'RELAY_SERVER_PORT=4401' <<<"$out"
check "prints the ports file's numbers as NAME=value" $?

( unset HQ_WEB_PORT; eval "$(bash "$DIR/ports.sh")"; [ "$HQ_WEB_PORT" = 4100 ] )
check "can be eval'd" $?

[ "$(HQ_WEB_PORT=4150 bash "$DIR/ports.sh" | grep '^HQ_WEB_PORT=')" = "HQ_WEB_PORT=4150" ]
check "a variable already set moves its port" $?

msg="$(HQ_WEB_PORT='4100; touch /tmp/ports-test-ran' bash "$DIR/ports.sh" 2>&1)"; rc=$?
[ $rc -ne 0 ] && [[ "$msg" == *"HQ_WEB_PORT is "* ]] && [[ "$msg" == *"Nothing was changed."* ]] && [ ! -e /tmp/ports-test-ran ]
check "refuses a port that is not a number, printing nothing to eval" $?
HQ_WEB_PORT=70000 bash "$DIR/ports.sh" >/dev/null 2>&1; [ $? -ne 0 ]
check "refuses a port above 65535" $?

node -e 'require("net").createServer().listen(59873, "127.0.0.1", function () { setTimeout(() => process.exit(0), 3000) })' &
pid=$!; sleep 1
msg="$(bash -c 'source "$1/require-free-ports.sh"; TEST_PORT=59873; require_free_ports TEST_PORT' _ "$DIR" 2>&1)"; rc=$?
kill $pid 2>/dev/null; wait $pid 2>/dev/null
[ $rc -ne 0 ] && [[ "$msg" == *"port 59873 is taken by"* ]] && [[ "$msg" == *"with TEST_PORT."* ]] && [[ "$msg" == *"Nothing was changed."* ]]
check "refuses a taken port, naming the holder and the variable" $?

bash -c 'source "$1/require-free-ports.sh"; TEST_PORT=59874; require_free_ports TEST_PORT' _ "$DIR" >/dev/null 2>&1
check "passes a free port" $?
exit $FAILS
