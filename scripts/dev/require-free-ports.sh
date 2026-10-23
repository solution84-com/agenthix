#!/usr/bin/env bash
# Refuse when a port a dev script is about to use is taken. Sourced after `eval "$(bash scripts/dev/ports.sh)"`:
#
#   require_free_ports HQ_WEB_PORT HQ_SERVER_PORT
#
# Arguments are variable names (or, for an overridden list, port numbers). A taken port is named with what holds
# it and the variable that moves it.

require_free_ports() {
  local name port holder taken=0
  for name in "$@"; do
    if [[ "$name" =~ ^[0-9]+$ ]]; then port="$name"; name="${REQUIRE_FREE_PORTS_HINT:-the setting that chose it}"; else port="${!name}"; fi
    if lsof -ti:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      holder="$(lsof -nP -i:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR == 2 { print $1 " (process " $2 ")" }')"
      echo "Refusing to start: port $port is taken by ${holder:-another process}. Stop it, or move this one with $name. Nothing was changed." >&2
      taken=1
    fi
  done
  [ "$taken" -eq 0 ] || exit 1
}
