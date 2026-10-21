/**
 * Logs and diagnostics (logs and diagnostics spec): Health, Recent errors, and the line the Infrastructure page shows
 * for it. Recent errors and the summary are for organisation admins, in sentences. Health is the machines' figures and
 * versions, so it is for fleet admins only, checked here (host-management spec §10). The logs and the support bundle
 * are `logOperations.ts`.
 */
import type {
  GetDiagnosticsHealth,
  CheckDiagnosticsHealthNow,
  GetRecentErrors,
  GetDiagnosticsSummary,
} from 'wasp/server/operations'
import { assertAdmin, assertFleetAdmin } from '../sites/assertAdmin'
import { readHqHealth, type HqHealth } from './hqHealth'
import { checkSitesNow, readSiteHealthCards, type SiteHealthCard } from './siteHealthCards'
import { readRecentErrors, type RecentErrors, type RecentErrorsRange } from './recentErrors'
import { listLogSources } from './logSources'

export type DiagnosticsHealth = { checkedAt: Date; hq: HqHealth; sites: SiteHealthCard[] }

async function health(): Promise<DiagnosticsHealth> {
  const [hq, sites] = await Promise.all([readHqHealth(), readSiteHealthCards()])
  return { checkedAt: new Date(), hq, sites }
}

export const getDiagnosticsHealth: GetDiagnosticsHealth<void, DiagnosticsHealth> = async (_args, context) => {
  await assertFleetAdmin(context)
  return health()
}

/** Check again: every connected site reports its health now, then the cards are read as on the page. */
export const checkDiagnosticsHealthNow: CheckDiagnosticsHealthNow<void, DiagnosticsHealth & { sitesAsked: number }> = async (_args, context) => {
  await assertFleetAdmin(context)
  const sitesAsked = await checkSitesNow()
  return { ...(await health()), sitesAsked }
}

export const getRecentErrors: GetRecentErrors<{ range?: RecentErrorsRange } | void, RecentErrors> = async (args, context) => {
  const me = await assertAdmin(context)
  const range: RecentErrorsRange = args && args.range === '7d' ? '7d' : '24h'
  return readRecentErrors(me, range)
}

export type DiagnosticsSummary = {
  /** Every occurrence in the last 24 hours, across the groups. */
  errorsLast24h: number
  /** The sites whose logs can be read here now. */
  sitesWithLogs: number
  sites: number
}

/** The Logs and diagnostics row on Organisation › Infrastructure. */
export const getDiagnosticsSummary: GetDiagnosticsSummary<void, DiagnosticsSummary> = async (_args, context) => {
  const me = await assertAdmin(context)
  const [errors, sources] = await Promise.all([readRecentErrors(me, '24h'), listLogSources()])
  const sites = sources.filter(s => s.kind === 'site')
  return {
    errorsLast24h: errors.groups.reduce((n, g) => n + g.count, 0),
    sitesWithLogs: sites.filter(s => !s.notice).length,
    sites: sites.length,
  }
}
