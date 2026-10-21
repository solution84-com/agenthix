/**
 * HQ API Route Handlers
 * ======================
 *
 * Only the public health check lives here. The machine-facing routes each
 * authenticate inside their own handler (a site's machine credential, or a
 * run's capability token), not in shared middleware.
 */
import type { HealthApi } from 'wasp/server/api'
import { upgradeHandlersReady } from './waspHttpServer'

/**
 * GET /health
 *
 * Public, so it answers status only (adr-0106): a version here would tell
 * anyone which known flaws to try. Admins read the version and commit on
 * Infrastructure › HQ, and HQ's own machine with `agenthix status`.
 */
export const healthHandler: HealthApi = async (_req, res, _context) => {
  // Up only once the site channel and the host and console links listen: a link dialled sooner is dropped.
  if (!upgradeHandlersReady()) return res.status(503).json({ status: 'starting' })
  return res.json({ status: 'ok' })
}
