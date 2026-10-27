#!/usr/bin/env bash
# Print the ports of core/src/ports/ports.ts, the one file they come from, as NAME=value lines a script can eval:
#
#   eval "$(bash scripts/dev/ports.sh)"
#
# A variable already set in the environment keeps its value, so exporting HQ_WEB_PORT=4150 moves that one port.
# Node 24 reads the .ts file as it is; no build is needed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

PORTS_FILE="$ROOT/core/src/ports/ports.ts" node --input-type=module -e '
  const { SERVICE_PORTS, DEV_TAILSCALE_PORTS } = await import(process.env.PORTS_FILE)
  const ports = {
    HQ_WEB_PORT: SERVICE_PORTS.hq.web,
    HQ_SERVER_PORT: SERVICE_PORTS.hq.server,
    HQ_DB_PORT: SERVICE_PORTS.hq.database,
    SITE_SERVER_PORT: SERVICE_PORTS.site.server,
    SITE_DB_PORT: SERVICE_PORTS.site.database,
    RELAY_SERVER_PORT: SERVICE_PORTS.relay.server,
    CONSOLE_WEB_PORT: SERVICE_PORTS.console.web,
    CONSOLE_SERVER_PORT: SERVICE_PORTS.console.server,
    TAILSCALE_HQ_WEB_PORT: DEV_TAILSCALE_PORTS.hqWeb,
    TAILSCALE_HQ_SERVER_PORT: DEV_TAILSCALE_PORTS.hqServer,
  }
  for (const [name, value] of Object.entries(ports)) {
    const set = process.env[name]
    console.log(`${name}=${set !== undefined && set !== "" ? set : value}`)
  }
'
