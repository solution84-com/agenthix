import type { Server as HttpServer } from 'node:http'
import { prisma } from 'wasp/server'
import { LIVE_PREVIEW_METHODS, type RelayBundleReport } from '@agenthix/core'
import { attachRelayLink, RelayLinks } from './relayLinkServer'
import { authenticateRelay, recordRelayReport, recordRelaySeen } from './relayStore'
import { createAppTicketBook } from './appTickets'
import { signAppTicket, signBundleTicket } from './relayTokens'
import { overRefusalThreshold } from './appRefusalGuard'
import { appAddress } from './appAddress'
import type { AppEntryDeps } from './appEntry'
import { createBundleCarrier, readBundleReport } from './bundles'
import { siteChannelRegistry } from '../sites/channel'
import { Logger } from '../server/utils/logger'
import { isOrgFeatureOn } from '../features/switches'

const logger = new Logger('RelayApps')

export { ensureHqRelay, NO_HQ_RELAY_MESSAGE } from './hqRelay'
export { placeUnplacedSites } from './placement'
export { issueFileTicket, type FileOpenedEntry } from './fileTickets'
export { appAddress, livePreviewPattern, livePreviewsHaveAnAddress, NO_PREVIEW_ADDRESS_MESSAGE } from './appAddress'
export { openLiveApp, type AppEntryForm, type OpenLiveAppArgs, type EntryLivePreview } from './appEntry'

/** The relays connected to hq now: the open operation answers `relay-unavailable` at once for one that is not. */
export const relayLinks = new RelayLinks()

export function isRelayConnected(relayId: string): boolean {
  return relayLinks.isConnected(relayId)
}

/**
 * Whether a live preview is running and `person` may see it: any member of its project (a Viewer included, who sees
 * everything), or the owner of a person's own workspace. No ticket stands while the live preview's flag is off.
 */
async function livePreviewOpenTo(livePreviewId: string, person: string): Promise<boolean> {
  if (!(await isOrgFeatureOn('livePreview'))) return false
  const lp = await prisma.livePreview.findUnique({
    where: { id: livePreviewId }, select: { state: true, projectId: true, ownerType: true, ownerId: true },
  })
  if (!lp || lp.state !== 'RUNNING') return false
  if (lp.projectId) {
    return (await prisma.projectMember.count({ where: { projectId: lp.projectId, userId: person } })) > 0
  }
  return lp.ownerType === 'user' && lp.ownerId === person
}

/**
 * Every app ticket hq signs, and its word on each when a relay asks. What cuts a person, an app or a live preview off
 * calls `appTickets.revoke`: a live preview stopping or pausing (`{ livePreviews: [id] }`), a person losing the
 * project or leaving (`{ person }`).
 */
export const appTickets = createAppTicketBook({
  sign: signAppTicket,
  livePreviewOpenTo,
  broadcast: frame => relayLinks.broadcast(frame),
})

/** Carries a Git bundle between two sites through the relay both hold their lines to (`bundles.ts`). */
export const carryBundle = createBundleCarrier({
  sign: signBundleTicket,
  send: (relayId, order) => relayLinks.send(relayId, order),
})

/** The relay both sites hold their lines to, connected now; null when they are on different relays or it is down. */
export async function bundleRelayFor(fromExecutionSiteId: string, toExecutionSiteId: string): Promise<string | null> {
  const sites = await prisma.executionSite.findMany({
    where: { id: { in: [fromExecutionSiteId, toExecutionSiteId] } }, select: { relayId: true },
  })
  const [a, b] = sites
  if (sites.length !== 2 || !a.relayId || a.relayId !== b.relayId) return null
  return isRelayConnected(a.relayId) ? a.relayId : null
}

const bundleListeners = new Set<(report: RelayBundleReport, relayId: string) => void>()
const cutOffListeners = new Set<(appIds: string[]) => void | Promise<void>>()

/** What a relay saw of each bundle it carried, for the live previews' bundle flow. */
export function onBundleReport(listener: (report: RelayBundleReport, relayId: string) => void): () => void {
  bundleListeners.add(listener)
  return () => bundleListeners.delete(listener)
}

/** Apps cut off at every relay for refusals past the threshold, for the live previews to stop them and say why. */
export function onAppsCutOff(listener: (appIds: string[]) => void | Promise<void>): () => void {
  cutOffListeners.add(listener)
  return () => cutOffListeners.delete(listener)
}

/** The real dependencies of opening a live app, but for the caller's own access check on the live preview. */
export function liveAppEntryDeps(livePreview: AppEntryDeps['livePreview']): AppEntryDeps {
  return {
    livePreview,
    appInLivePreview: async (appId, livePreviewId) => (await prisma.liveApp.count({ where: { id: appId, livePreviewId } })) > 0,
    appAddress: appId => appAddress(appId),
    siteAndRelay: async executionSiteId => {
      const site = await prisma.executionSite.findUnique({ where: { id: executionSiteId }, include: { relay: true } })
      if (!site || site.status === 'REVOKED') return null
      const relay = site.relay && site.relay.state !== 'REMOVED' && site.relay.credentialHash !== null ? site.relay : null
      return { siteId: site.siteId, label: site.label, relayId: relay?.id ?? null, relayConnected: !!relay && isRelayConnected(relay.id) }
    },
    askSite: (siteId, params) => siteChannelRegistry.request(siteId, LIVE_PREVIEW_METHODS.act, params),
    issue: input => appTickets.issue(input),
  }
}

/** The relays' links to hq, at `RELAY_HQ_LINK_PATH`. */
export function startRelayLink(server: HttpServer) {
  return attachRelayLink(server, {
    authenticate: authenticateRelay,
    recordSeen: recordRelaySeen,
    recordReport: recordRelayReport,
    bundleReport: (relayId, frame) => {
      const report = readBundleReport(frame)
      if (!report) return logger.warn(`relay ${relayId}: dropped a bundle report it could not read`)
      for (const listener of bundleListeners) listener(report, relayId)
    },
    answerAsk: (relayId, ask) => appTickets.stands(relayId, ask),
    onAppRefusals: (relayId, counts) => {
      // An app refused this often is cut off at every relay, its streams ending at once, then stopped in its live preview.
      const apps = overRefusalThreshold(counts)
      if (apps.length === 0) return
      logger.warn(`relay ${relayId} refused requests to ${apps.length} app(s) past the threshold; their streams were ended`)
      appTickets.revoke({ apps })
      for (const listener of cutOffListeners) {
        void Promise.resolve(listener(apps)).catch(err => logger.error('could not stop apps cut off at the relays:', err))
      }
    },
  }, relayLinks)
}
