#!/usr/bin/env bash
# Tests fresh.sh's database naming and refusal logic without starting anything.
set -uo pipefail
FRESH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/fresh.sh"
fail=0
check() { if [ "$2" = ok ]; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi; }

out=$(FRESH_PORTS="59871" bash "$FRESH" --dry-run 2>&1); rc=$?
[ $rc -eq 0 ] && [[ "$out" == *"agenthix_fresh on port 4109"* ]] && [[ "$out" == *"agenthix_site_fresh on port 4209"* ]] && check "names the two fresh databases" ok || check "names the two fresh databases" no
[[ "$out" != *"drop and recreate"* ]] && check "no reset without --reset" ok || check "no reset without --reset" no

out=$(FRESH_PORTS="59871" bash "$FRESH" --dry-run --reset 2>&1)
[[ "$out" == *"drop and recreate"* ]] && check "--reset says it recreates" ok || check "--reset says it recreates" no

python3 -m http.server 59872 --bind 127.0.0.1 >/dev/null 2>&1 &
pid=$!; sleep 1
out=$(FRESH_PORTS="59872" bash "$FRESH" --dry-run 2>&1); rc=$?
kill $pid 2>/dev/null
[ $rc -ne 0 ] && [[ "$out" == *"Refusing to start: port 59872"* ]] && check "refuses when a port is in use" ok || check "refuses when a port is in use" no

bash "$FRESH" --bogus >/dev/null 2>&1 && check "rejects unknown flags" no || check "rejects unknown flags" ok
exit $fail
