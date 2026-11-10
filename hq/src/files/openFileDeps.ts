/**
 * The open operation's live dependencies. Access is checked exactly as each space's content read checks it today: a
 * place's file and an artefact by the one location access rule (`assertLocationAccess`, read), a knowledge page by the
 * Knowledge tool's (`openKnowledge`). Every refusal reads as `not-found`, so the answer never says whether a file
 * exists in a place the person can't reach (V9).
 */
import { HttpError, prisma } from 'wasp/server'
import {
  FILE_ABOUT_METHOD, LocationFileError,
  type FileAboutResult, type LocationRef, type SiteFileRef,
} from '@agenthix/core'
import { assertLocationAccess } from '../storage/locationAccess'
import { resolveStorageSite, ensureOrgKnowledgePlacement } from '../storage/storageSite'
import { rethrowLocationFileErrorAsHttp } from '../storage/httpErrors'
import { SiteUnreachableError } from '../storage/workspaceStore'
import { openKnowledge } from '../knowledge/people/access'
import { KnowledgeRefusal } from '../knowledge/people/deps'
import { siteChannelRegistry, ChannelRequestFailed } from '../sites/channel'
import { displaySiteName, displayRelayName } from '../shared/siteName'
import { isRelayConnected, issueFileTicket } from '../relays'
import { browserAddressOf } from '../relays/relayAddress'
import { OpenRefused, tooOldFor, type OpenFileDeps, type SiteAndRelay } from './openFile'

/** Short of the channel's default: a person is waiting on a file opening, and a site that slow is as good as away. */
export const FILE_ABOUT_TIMEOUT_MS = 10_000

const UNANSWERED = new Set(['offline', 'timeout', 'disconnected', 'unknown_method'])

/** The location exactly as the site's strict check wants it, with nothing a caller's object carried beside it. */
function wireLocation(loc: LocationRef): LocationRef {
  return { ownerType: loc.ownerType, ownerId: loc.ownerId, workspaceId: loc.workspaceId ?? null, taskId: loc.taskId ?? null }
}

/** A refusal of access (or of a place that can't be) as `not-found`; a site that can't be asked as `site-unavailable`. */
function asRefusal(err: unknown): never {
  if (err instanceof OpenRefused) throw err
  if (err instanceof KnowledgeRefusal) throw new OpenRefused(err.status === 503 ? 'site-unavailable' : 'not-found')
  if (err instanceof SiteUnreachableError) throw new OpenRefused('site-unavailable')
  if (err instanceof HttpError) {
    if (err.statusCode === 401) throw err
    if (err.statusCode === 503) throw new OpenRefused('site-unavailable')
    if (err.statusCode >= 400 && err.statusCode < 500) throw new OpenRefused('not-found')
  }
  throw err
}

export async function checkAccess(ref: SiteFileRef, userId: string): Promise<SiteFileRef> {
  try {
    switch (ref.space) {
      case 'place':
        await assertLocationAccess(ref.loc, userId, 'read')
        return { ...ref, loc: wireLocation(ref.loc) }
      case 'artefact':
        await assertLocationAccess({ ownerType: ref.owner.ownerType, ownerId: ref.owner.ownerId }, userId, 'read')
        return ref
      case 'knowledge': {
        const access = await openKnowledge(ref.owner, userId)
        return { ...ref, owner: access.ref }
      }
    }
  } catch (err) {
    asRefusal(err)
  }
}

export async function siteFor(ref: SiteFileRef): Promise<string> {
  try {
    if (ref.space === 'place') return await resolveStorageSite(ref.loc)
    if (ref.space === 'knowledge' && ref.owner.ownerType === 'org') return await ensureOrgKnowledgePlacement()
    const { ownerType, ownerId } = ref.owner
    if (ownerType === 'org') throw new OpenRefused('not-found')
    return await resolveStorageSite({ ownerType, ownerId })
  } catch (err) {
    asRefusal(err)
  }
}

export async function siteAndRelay(siteId: string): Promise<SiteAndRelay | null> {
  const site = await prisma.executionSite.findUnique({ where: { siteId }, include: { relay: true } })
  if (!site || site.status === 'REVOKED') return null
  const relay = site.relay
  return {
    siteId,
    siteName: displaySiteName(site),
    relay: relay && {
      id: relay.id, name: displayRelayName(relay), isHq: relay.isHq, address: relay.address,
      usable: relay.state !== 'REMOVED' && relay.credentialHash !== null,
    },
  }
}

export async function aboutOnSite(siteId: string, ref: SiteFileRef): Promise<FileAboutResult> {
  // An older site would answer a file at a commit with the file on disk: it is never asked.
  const conn = siteChannelRegistry.get(siteId)
  if (conn && tooOldFor(ref, conn.protocol)) throw new OpenRefused('site-unavailable', 'upgrade')
  try {
    return await siteChannelRegistry.request(siteId, FILE_ABOUT_METHOD, ref, FILE_ABOUT_TIMEOUT_MS)
  } catch (err) {
    if (err instanceof ChannelRequestFailed && UNANSWERED.has(err.code)) throw new OpenRefused('site-unavailable')
    const fromSite = err instanceof Error ? LocationFileError.fromWire(err.message) : null
    if (fromSite && ['not_found', 'outside', 'not_a_file'].includes(fromSite.code)) throw new OpenRefused('not-found')
    if (fromSite) rethrowLocationFileErrorAsHttp(fromSite)
    throw err
  }
}

export const openFileDeps: OpenFileDeps = {
  checkAccess,
  siteFor,
  siteAndRelay,
  isRelayConnected,
  about: aboutOnSite,
  browserAddressOf: relay => browserAddressOf(relay),
  issue: issueFileTicket,
}
