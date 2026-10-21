/**
 * What hq asks a site for its logs and diagnostics page (adr-0106).
 *
 * - `site.readLogs` — one page of the site's own log, newest first
 *   (`logging/logQuery.ts`). hq asks only when an admin opens that site's logs
 *   or builds a support bundle, and keeps nothing it reads.
 * - `site.healthNow` — the site's health report (`siteHealth.ts`) taken now,
 *   for **Check again**, rather than waiting for the next minute's report.
 */
import type { LogPage, LogQuery } from '../logging/logQuery.js'

export const SITE_DIAGNOSTICS_METHODS = {
  readLogs: 'site.readLogs',
  healthNow: 'site.healthNow',
} as const

export type SiteReadLogsParams = LogQuery
export type SiteReadLogsResult = LogPage
