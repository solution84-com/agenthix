/**
 * Each site's health card (logs and diagnostics spec, Health): its state as
 * on Execution Sites, runs now against the most it takes, Docker and disk
 * free from the report it already sends, and whether its run store answers —
 * asked now of every site at once, which Execution Sites never showed.
 *
 * `checkSitesNow` is **Check again**: every connected site is asked
 * for its health report now, rather than at its next minute.
 */
import { SITE_DIAGNOSTICS_METHODS, parseSiteHealth, type SiteHealth } from '@agenthix/core'
import { readSiteFacts } from '../sites/siteFacts'
import { siteStanding, type SiteGroup, type SiteProblem } from '../sites/siteStanding'
import { hqStartedListeningAt, reconcileSiteNotifications } from '../sites/siteNotifications'
import { recordSiteHealth } from '../sites/siteHealth'
import { askEverySite } from '../sites/combinedRead'
import { siteChannelRegistry } from '../sites/channel'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { Logger } from '../server/utils/logger'
import { displaySiteName } from '../shared/siteName'

const logger = new Logger('Diagnostics')

const HEALTH_NOW_TIMEOUT_MS = 10_000

export type RunStoreAnswer = 'answers' | 'not-connected' | 'no-answer'

export type SiteHealthCard = {
  executionSiteId: string
  siteId: string
  /** As shown: HQ's own site is "hq-box · HQ's site". */
  label: string
  isDefault: boolean
  status: string
  connected: boolean
  group: SiteGroup
  problems: SiteProblem[]
  protocolVersion: string | null
  health: SiteHealth | null
  healthReportedAt: Date | null
  runStore: RunStoreAnswer
  /** Why the run store did not answer, in prose; null when it did. */
  runStoreDetail: string | null
}

export async function readSiteHealthCards(now: Date = new Date()): Promise<SiteHealthCard[]> {
  const [sites, runStores] = await Promise.all([
    readSiteFacts(),
    askEverySite(site => siteRuntimeStore.countRuns(site.siteId, {})),
  ])
  const answered = new Set(runStores.answers.map(a => a.siteId))
  const silent = new Map(runStores.unanswered.map(s => [s.siteId, s]))
  // HQ's own site first, then by name, so the cards keep their places between checks.
  const shown = sites.filter(s => !s.revoked).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.label.localeCompare(b.label))
  return shown.map(site => {
    const { group, problems } = siteStanding(site, now, hqStartedListeningAt())
    const connected = site.status === 'ONLINE'
    const silence = silent.get(site.siteId)
    return {
      executionSiteId: site.id,
      siteId: site.siteId,
      label: displaySiteName(site),
      isDefault: site.isDefault,
      status: site.status,
      connected,
      group,
      problems,
      protocolVersion: site.protocolVersion,
      health: site.health,
      healthReportedAt: site.healthReportedAt,
      runStore: answered.has(site.siteId) ? 'answers' : silence?.reason === 'offline' || !connected ? 'not-connected' : 'no-answer',
      runStoreDetail: answered.has(site.siteId) ? null : silence?.detail ?? null,
    }
  })
}

/** Asks every connected site for its health now and stores each answer; returns how many answered. */
export async function checkSitesNow(): Promise<number> {
  const ids = siteChannelRegistry.onlineSiteIds
  const answers = await Promise.all(ids.map(async siteId => {
    try {
      const health = parseSiteHealth(await siteChannelRegistry.request(siteId, SITE_DIAGNOSTICS_METHODS.healthNow, {}, HEALTH_NOW_TIMEOUT_MS))
      if (!health) return false
      await recordSiteHealth(siteId, health)
      return true
    } catch (err) {
      logger.warn(`site ${siteId} did not report its health when asked`, err)
      return false
    }
  }))
  await reconcileSiteNotifications()
  return answers.filter(Boolean).length
}
