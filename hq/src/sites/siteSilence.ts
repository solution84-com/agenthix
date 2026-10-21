/**
 * Why a site is missing from a combined read's total, and what a person is
 * told about it. The judgement half of `combinedRead.ts`, which owns the
 * orchestration; nothing here knows what was being read.
 *
 * Classification reuses the vocabulary the repository already has —
 * `ChannelRequestFailed`'s codes and `SiteUnreachableError`'s reasons — rather
 * than inventing a second way to say "the site is unreachable". The four
 * reasons are kept apart because the difference between them is the difference
 * between what a person should go and do (`SiteSilenceReason` in
 * `@agenthix/core` documents each).
 */
import { SITE_PROTOCOL_VERSION, checkProtocolCompatibility, type SiteSilence } from '@agenthix/core'
import { ChannelRequestFailed } from './channel/pendingRequests'
import { SiteUnreachableError } from '../storage/workspaceStore'
import type { EligibleSite } from './eligibleSites'
import { Logger } from '../server/utils/logger'

const logger = new Logger('CombinedRead')

/** @see schema.prisma — the status a site carries once hq has refused its protocol. */
const VERSION_MISMATCH = 'VERSION_MISMATCH'

/**
 * `gone` is a site that left the organisation between the listing and the
 * call. It is dropped rather than named, for the same reason the listing
 * excludes a revoked site in the first place.
 */
export type SilenceOrGone = { kind: 'silence'; silence: SiteSilence } | { kind: 'gone' }

export function silenceFor(site: EligibleSite, reason: SiteSilence['reason'], detail: string): SiteSilence {
  return { siteId: site.siteId, label: site.label, reason, detail }
}

export function timeoutSilence(site: EligibleSite, timeoutMs: number): SiteSilence {
  return silenceFor(site, 'timeout', `Did not answer within ${describeWait(timeoutMs)}.`)
}

/**
 * A site hq has already refused, and one whose recorded version the compatibility rule refuses (majors two or more
 * apart), are named without being called — there is nothing to gain from asking. Returns the prose to name it with,
 * or null if the site should be asked.
 *
 * A site with NO recorded version is asked anyway. It registered and has never connected, so it is not on an old
 * protocol; it is simply not here, and the call reports that far more honestly than a guess about its version would.
 */
export function versionShortfall(site: EligibleSite): string | null {
  if (site.status === VERSION_MISMATCH) return refusedDetail(site.protocolVersion)
  if (!site.protocolVersion) return null
  // Defence in depth: the handshake refuses such a site and marks it VERSION_MISMATCH, so the branch above should
  // already have caught it — but if that status were ever stale, this is the only thing between hq and a read sent
  // to a site the rule says it cannot talk to.
  return checkProtocolCompatibility(SITE_PROTOCOL_VERSION, site.protocolVersion).ok ? null : refusedDetail(site.protocolVersion)
}

export function classifyFailure(site: EligibleSite, err: unknown, timeoutMs: number): SilenceOrGone {
  if (err instanceof SiteUnreachableError) {
    if (err.reason === 'revoked') return { kind: 'gone' }
    if (err.reason === 'version_mismatch') {
      const detail = refusedDetail(err.protocolVersion ?? site.protocolVersion)
      return { kind: 'silence', silence: silenceFor(site, 'version', detail) }
    }
    return { kind: 'silence', silence: silenceFor(site, 'offline', OFFLINE_DETAIL) }
  }

  if (err instanceof ChannelRequestFailed) {
    switch (err.code) {
      case 'timeout':
        return { kind: 'silence', silence: timeoutSilence(site, timeoutMs) }
      case 'offline':
      case 'disconnected':
        return { kind: 'silence', silence: silenceFor(site, 'offline', OFFLINE_DETAIL) }
      case 'unknown_method':
        // A site that does not know the method is behind on its minor: an upgrade problem, not a fault.
        return { kind: 'silence', silence: silenceFor(site, 'version', unknownMethodDetail(site)) }
    }
  }

  return { kind: 'silence', silence: silenceFor(site, 'error', errorDetail(site, err)) }
}

const OFFLINE_DETAIL = 'Not connected to hq, so it could not be asked.'

/**
 * What a refused site is told as: the rule applied to its recorded version, naming the side that must upgrade. A
 * version hq recorded as '' means a site presented no version header at all, which must read as unknown rather than
 * as a blank number.
 */
function refusedDetail(version: string | null): string {
  const known = version || null
  const c = checkProtocolCompatibility(SITE_PROTOCOL_VERSION, known)
  if (!c.ok && c.reason === 'too_far_apart') {
    return `Runs protocol ${known}, too far from HQ's ${SITE_PROTOCOL_VERSION} to work together. ` +
      `Upgrade ${c.upgrade === 'own' ? 'HQ' : 'the site'}.`
  }
  return known
    ? `Runs protocol ${known}, which HQ cannot use. Upgrade the site.`
    : 'Runs a protocol HQ cannot use. Upgrade the site.'
}

function unknownMethodDetail(site: EligibleSite): string {
  return site.protocolVersion
    ? `Runs protocol ${site.protocolVersion}, which does not serve this read yet. Upgrade the site.`
    : 'Does not serve this read yet. Upgrade the site.'
}

/**
 * What a person is told when a site's own answer was a failure.
 *
 * An allowlist, not a scrub. This bucket is by definition the one whose
 * message nobody has vetted — it crosses the channel from a site, or comes out
 * of whatever threw — and the rule is that a person never sees a raw
 * exception, a stack, an address or an internal id. Editing arbitrary text
 * until it looks safe is a losing position: every pattern removed is one
 * shape, and the next message is a different shape. A bare `host:port`, an
 * `Error:` that is not at the start, a uuid in the middle of a sentence — each
 * defeats a different rule, and the rules only ever cover what somebody
 * thought of. So nothing upstream reaches the person at all: a fixed sentence
 * per case this module recognises, and one generic sentence for everything
 * else.
 *
 * The real failure is not lost — it is logged here, with the site's label, for
 * whoever has to diagnose it.
 */
export function errorDetail(site: EligibleSite, err: unknown): string {
  logger.warn(`Combined read failed on site "${site.label}":`, err)
  if (err instanceof ChannelRequestFailed && err.code === 'handler_failed') {
    return 'The site could not complete this read.'
  }
  return 'The read failed on this site.'
}

export function describeWait(ms: number): string {
  if (ms >= 1000) {
    const seconds = Math.round(ms / 100) / 10
    return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
  }
  return `${ms} ms`
}
