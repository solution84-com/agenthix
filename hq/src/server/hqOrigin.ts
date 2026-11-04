import { SERVICE_PORTS } from '@agenthix/core'

/** Where the browser loads hq's app from: `HQ_ORIGIN`, else hq's own web port. */
export const hqOrigin = (): string => process.env.HQ_ORIGIN ?? `http://localhost:${SERVICE_PORTS.hq.web}`

/** Where Wasp serves the app from: `WASP_WEB_CLIENT_URL`, else hq's own web port. */
export const webClientOrigin = (): string => process.env.WASP_WEB_CLIENT_URL ?? `http://localhost:${SERVICE_PORTS.hq.web}`

/** A request's address with its query string left off: the query can carry names of a member's files. */
export const loggablePath = (url: string): string => url.split('?')[0]
