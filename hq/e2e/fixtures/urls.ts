import { SERVICE_PORTS } from '@agenthix/core'

// The e2e suite runs against an hq that is already running; it does not start one. A run that starts its own hq on
// free ports (the guide's screenshots do) names them in these two variables. With neither set the suite finds the
// hq that `scripts/dev/start.sh` runs, on the development ports.
export const CLIENT_URL = process.env.E2E_CLIENT_URL ?? `http://localhost:${SERVICE_PORTS.hq.web}`
export const SERVER_URL = process.env.E2E_SERVER_URL ?? `http://localhost:${SERVICE_PORTS.hq.server}`
