/**
 * A branch carried between two sites as a Git bundle (live preview spec section 5, *On another site*; core's
 * `protocol/branchBundles.ts`). hq asks the source site to make it, has a relay carry it on a single-use ticket naming
 * both ends, its SHA-256 and size, and waits for the destination's `bundle.landed`. A landing names the transfer by the
 * ticket's `jti`; one hq is not waiting for, or from a site that is not the destination, is dropped.
 */
import { randomUUID } from 'node:crypto'
import { HttpError } from 'wasp/server'
import {
  BUNDLE_METHODS, BUNDLE_WORK_TIMEOUT_MS, isBundleWriteHead,
  type BundleSource, type BundleWriteHead, type CommitId, type WorkspaceRepoRef,
} from '@agenthix/core'
import { askSite } from './siteAsk'
import { bundleRelayFor, carryBundle as carryThroughRelay, onBundleReport } from '../relays'
import { NOTHING, refusalError } from './words'
import { Logger } from '../server/utils/logger'

const logger = new Logger('LivePreviewBundles')

type Waiter = { toSiteId: string; resolve(head: BundleWriteHead): void; timer: ReturnType<typeof setTimeout> }
const waiting = new Map<string, Waiter>()

/** The destination said how a transfer ended; `siteId` is the site the event came from. */
export function bundleLanded(siteId: string, data: unknown): boolean {
  const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  const transferId = typeof d?.transferId === 'string' ? d.transferId : null
  const w = transferId ? waiting.get(transferId) : undefined
  if (!w || w.toSiteId !== siteId || !isBundleWriteHead(d?.result)) return false
  waiting.delete(transferId!)
  clearTimeout(w.timer)
  w.resolve(d!.result as BundleWriteHead)
  return true
}

/** A relay could not carry a transfer (an end offline, a stream broken): the wait ends at once. */
function relayFailed(transferId: string): void {
  const w = waiting.get(transferId)
  if (!w) return
  waiting.delete(transferId)
  clearTimeout(w.timer)
  w.resolve({ ok: false, refusal: 'failed' })
}

onBundleReport(report => {
  if (!report.outcome.done) relayFailed(report.transferId)
})

function waitForLanding(transferId: string, toSiteId: string, timeoutMs: number): Promise<BundleWriteHead> {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      waiting.delete(transferId)
      resolve({ ok: false, refusal: 'failed' })
    }, timeoutMs)
    timer.unref?.()
    waiting.set(transferId, { toSiteId, resolve, timer })
  })
}

/** A site as a bundle's end: its own id (the channel's), hq's `ExecutionSite.id`, and its name. */
export type BundleEnd = { siteId: string; executionSiteId: string; name: string }

export type CarryAsk = {
  source: BundleSource
  prerequisites: CommitId[]
  from: BundleEnd
  to: BundleEnd
  direction: 'toPreview' | 'back'
  personId: string
  workspaceId: string
  branch: string
}

export type Carried =
  | { carried: true; bundleId: string; head: CommitId }
  | { carried: false; reason: 'nothing_new'; head: CommitId }

/** Makes the bundle on the source and has it carried to the destination; throws hq's words when it cannot. */
export async function carryBundle(a: CarryAsk, timeoutMs = BUNDLE_WORK_TIMEOUT_MS): Promise<Carried> {
  const relayId = await bundleRelayFor(a.from.executionSiteId, a.to.executionSiteId)
  if (!relayId) {
    throw new HttpError(503, `${a.from.name} and ${a.to.name} do not share a connected relay now, so ${a.branch} cannot go there. Pick ${a.from.name}, or try again in a minute. ${NOTHING}`, { code: 'noRelay' })
  }
  const bundleId = randomUUID()
  const answer = await askSite(a.from.siteId, BUNDLE_METHODS.make, { bundleId, source: a.source, prerequisites: a.prerequisites }, timeoutMs)
  if (!answer.ok) throw refusalError(answer.refusal, a.from.name, a.branch)
  const made = answer.result
  if (!made.made) {
    if (made.reason === 'nothing_new') return { carried: false, reason: 'nothing_new', head: made.head }
    throw new HttpError(409, `${a.branch} is too large to send to ${a.to.name}. Start its live preview on ${a.from.name} instead. ${NOTHING}`)
  }
  try {
    const started = await carryThroughRelay({
      relay: relayId, person: a.personId, bundleId, direction: a.direction, workspaceId: a.workspaceId, branch: a.branch,
      from: { site: a.from.siteId }, to: { site: a.to.siteId }, sha256: made.sha256, size: made.size,
    })
    if (!started.started) throw new HttpError(503, `The relay between ${a.from.name} and ${a.to.name} isn't connected. Try again in a minute. ${NOTHING}`)
    const landed = await waitForLanding(started.transferId, a.to.siteId, timeoutMs)
    if (!landed.ok) {
      throw new HttpError(502, `${a.branch} did not reach ${a.to.name} (${landed.refusal}). Try again in a minute. ${NOTHING}`)
    }
    return { carried: true, bundleId, head: made.head }
  } finally {
    // The source's copy of the bundle is not needed once it has landed, or failed to.
    void askSite(a.from.siteId, BUNDLE_METHODS.drop, { bundleId }).catch(err =>
      logger.warn(`bundle ${bundleId} not dropped on ${a.from.siteId}: ${err instanceof Error ? err.message : String(err)}`))
  }
}

export function dropBundle(siteId: string, bundleId: string): void {
  void askSite(siteId, BUNDLE_METHODS.drop, { bundleId }).catch(() => {})
}

export function sourceOf(ref: WorkspaceRepoRef, onMain: boolean, branch: string): BundleSource {
  return onMain ? { kind: 'main', workspace: ref } : { kind: 'branch', workspace: ref, branch }
}

export function __resetBundlesForTests(): void {
  for (const w of waiting.values()) clearTimeout(w.timer)
  waiting.clear()
}
