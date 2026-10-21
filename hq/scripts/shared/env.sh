#!/usr/bin/env bash
# Shared helpers for env file reading and container management.
# Sourced by other scripts — not run directly.

load_env() {
  local file="$1"
  if [[ -f "$file" ]]; then
    # shellcheck disable=SC2046
    export $(grep -v '^#' "$file" | grep '=' | xargs)
  fi
}

read_env_var() {
  local file="$1" key="$2" default="$3"
  if [[ -f "$file" ]]; then
    grep -E "^${key}=" "$file" | cut -d= -f2 || echo "$default"
  else
    echo "$default"
  fi
}

remove_agent_containers() {
  local prefix="$1"
  docker ps -a --filter "name=^${prefix}-" --format '{{.Names}}' | xargs -r docker rm -f 2>/dev/null || true
}
