/**
 * Opening a live preview (live preview spec section 4, *Opening one*; section 5, *Sites and capacity*):
 *
 * 1. HQ checks the person may start it (a Member or Admin of the project, or the owner of their own storage), that
 *    live apps have an address on this install, and that the workspace is a Git repository.
 * 2. One live preview per branch: under the branch's lock, a live one is answered as it is, so a second person (or a
 *    second click) sees the same one. Otherwise HQ picks the site (or takes the person's pick, if allowed and with room)
 *    and writes the row STARTING, still under the lock.
 * 3. Outside the lock, the site is asked. On the workspace's own site the live preview binds the branch's copy (or a
 *    fresh copy of `main`); on another site the branch goes there first as a bundle, and binds a copy made from it.
 *    A branch with no copy on its workspace's site (a done task's, whose copy went when its run ended) has one made
 *    first, as a run would make it (`copyForBranch`).
 *
 * 4. Once it runs, the app started last on the branch (on `main`, on any branch) starts with it (`startAppOnOpen`).
 *
 * A stop that lands while the site is still opening it leaves the row STOPPED; the site's late answer is then followed
 * by a stop. A site that refuses, or goes silent, leaves the row STOPPED with why, and any container it may have
 * started is stopped when the site is back (`reconcile.ts`).
 */
import { randomUUID } from 'node:crypto'
import { HttpError, prisma } from 'wasp/server'
import type { LivePreview } from '@prisma/client'
import {
  BRANCH_READ_METHODS, BranchWorkError, LIVE_PREVIEW_METHODS,
  type BranchListResult, type LivePreviewCopyRef, type LivePreviewSummary,
} from '@agenthix/core'
import { reachWorkspace, type ReachedWorkspace } from '../branches/workspaceAccess'
import { siteCall } from '../branches/siteCalls'
import { copyForBranch } from '../branches/codeWorkDispatch'
import { liveCopyOf, openBranchById, openBranches, mergeBaseOf } from '../branches/branchRows'
import { askSite, OPEN_TIMEOUT_MS, SiteFailed, SiteSilent } from './siteAsk'
import { carryBundle, sourceOf } from './bundles'
import { hasRoom, pickSite, siteChoices, type SiteChoice } from './sites'
import { LIVE, livePreviewOn, lockSlot, moveFromSummary, moveLivePreview, touchLivePreview, type Slot } from './store'
import { livePreviewsHaveAnAddress, NO_PREVIEW_ADDRESS_MESSAGE } from '../relays'
import { emitLivePreviewChange } from './socket'
import { NOTHING, pausedDetail, refusalError, siteAnswerUnreadable, siteSilent, stoppedDetail } from './words'
import { releaseCopyAfterStop, stopOnSite } from './stopping'
import { viewOf } from './views'
import { startAppOnOpen } from './personApps'
import type { LivePreviewView, StartLivePreviewInput } from './types'

export type Target = Slot & { branch: string; onMain: boolean; branchCopyId: string | null }

/** The words for a live preview with no address to open its apps at: a bare network address (spec section 5). */
export const NO_ADDRESS = NO_PREVIEW_ADDRESS_MESSAGE

export function liveAppsHaveAddress(): boolean {
  return livePreviewsHaveAnAddress()
}

/** `main`'s line and every branch's, from the site; refused in words when the workspace is not a Git repository. */
export async function branchListOf(ws: Pick<ReachedWorkspace, 'logicalSiteId' | 'ref'>): Promise<BranchListResult> {
  const rows = await openBranches(ws.ref.workspaceId)
  const merged = rows.flatMap(r => { const base = mergeBaseOf(r); return base ? [{ branch: r.name, base }] : [] })
  try {
    return await siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.list, { workspace: ws.ref, merged })
  } catch (err) {
    if (err instanceof BranchWorkError && err.code === 'not_repository') {
      throw new HttpError(409, `This workspace isn't a Git repository yet. Turn Git on first, then start its live preview. ${NOTHING}`, { code: 'notRepository' })
    }
    throw err
  }
}

/** The branch (or `main`) the live preview runs from, as hq holds it. */
export async function targetOf(ws: ReachedWorkspace, branchId: unknown): Promise<Target> {
  if (branchId === null || branchId === undefined) {
    const list = await branchListOf(ws)
    return { workspaceId: ws.ref.workspaceId, branchId: null, branch: list.main.name, onMain: true, branchCopyId: null }
  }
  const branch = await openBranchById(ws.ref.workspaceId, branchId)
  if (!branch) throw new HttpError(404, `That branch is not open any more. Reload to see where it stands. ${NOTHING}`)
  const copy = liveCopyOf(branch)
  return {
    workspaceId: ws.ref.workspaceId, branchId: branch.id, branch: branch.name, onMain: false,
    branchCopyId: copy?.state === 'READY' && copy.siteId === ws.executionSiteId ? copy.folderId : null,
  }
}

function chosenSite(choices: SiteChoice[], wanted: unknown): SiteChoice {
  if (typeof wanted === 'string' && wanted) {
    const c = choices.find(s => s.executionSiteId === wanted)
    if (!c) throw new HttpError(409, `That site does not run live previews. Pick one of the sites listed. ${NOTHING}`, { code: 'noSuchSite' })
    if (c.blocked) throw new HttpError(409, `${c.blocked} Pick another site. ${NOTHING}`, { code: 'siteBlocked' })
    if (!hasRoom(c)) throw new HttpError(409, `${c.name} has ${c.open} of ${c.limit} live previews open. Stop one of yours, or pick another site. ${NOTHING}`, { code: 'full' })
    return c
  }
  const picked = pickSite(choices)
  if (picked) return picked
  const own = choices.find(c => c.isWorkspaceSite)
  if (own && !own.blocked && !hasRoom(own)) {
    throw new HttpError(409, `${own.name} has ${own.open} of ${own.limit} live previews open. Stop one of yours, or ask a fleet admin for more. ${NOTHING}`, { code: 'full' })
  }
  if (own?.blocked) throw new HttpError(409, `${own.blocked} ${NOTHING}`, { code: 'siteBlocked' })
  throw new HttpError(409, `No site runs live previews for this workspace now. A fleet admin turns them on for a site in the Fleet Console. ${NOTHING}`, { code: 'noSite' })
}

/** A branch with no copy on its workspace's site, about to get a new live preview there. */
async function needsCopy(ws: ReachedWorkspace, target: Target, wanted: unknown): Promise<boolean> {
  if (target.onMain || target.branchCopyId || !target.branchId) return false
  if (await livePreviewOn(prisma, target)) return false
  return chosenSite(await siteChoices(ws.executionSiteId), wanted).executionSiteId === ws.executionSiteId
}

type Begun = { row: LivePreview; fresh: boolean; site: SiteChoice | null }

async function begin(ws: ReachedWorkspace, target: Target, userId: string, wanted: unknown): Promise<Begun> {
  const choices = await siteChoices(ws.executionSiteId)
  return prisma.$transaction(async tx => {
    await lockSlot(tx, target)
    const live = await livePreviewOn(tx, target)
    if (live) return { row: live, fresh: false, site: null }
    const site = chosenSite(choices, wanted)
    // The site's own count may lag hq's: checked again here, under the lock, against what hq holds.
    const open = await tx.livePreview.count({ where: { executionSiteId: site.executionSiteId, state: { in: LIVE } } })
    if (!hasRoom({ open, limit: site.limit })) {
      throw new HttpError(409, `${site.name} has ${open} of ${site.limit} live previews open. Stop one of yours, or pick another site. ${NOTHING}`, { code: 'full' })
    }
    const onWorkspaceSite = site.executionSiteId === ws.executionSiteId
    if (onWorkspaceSite && !target.onMain && !target.branchCopyId) {
      throw new HttpError(409, `${target.branch}'s working copy was removed while the live preview started. Start it again, which makes a fresh one. ${NOTHING}`, { code: 'noCopy' })
    }
    const row = await tx.livePreview.create({
      data: {
        executionSiteId: site.executionSiteId,
        projectId: ws.ref.ownerType === 'project' ? ws.ref.ownerId : null,
        workspaceId: ws.ref.workspaceId, ownerType: ws.ref.ownerType, ownerId: ws.ref.ownerId, workspaceName: ws.name,
        branchId: target.branchId, branch: target.branch, onMain: target.onMain,
        copyKind: onWorkspaceSite ? (target.onMain ? 'MAIN' : 'BRANCH') : 'BUNDLE',
        copyId: onWorkspaceSite && !target.onMain ? target.branchCopyId! : randomUUID(),
        userId,
      },
    })
    return { row, fresh: true, site }
  })
}

/**
 * Marks a live preview that did not start as STOPPED, with why; a row already stopped is left as it is. A copy made for
 * it on a done task's branch goes again, unless the site went silent and may still bind it (`reconcile.ts` then).
 */
async function failed(row: LivePreview, detail: string, siteAnswered = true): Promise<void> {
  await moveLivePreview(row.id, { state: 'STOPPED', reason: 'failed', detail, since: new Date(), stoppedAt: new Date() })
  if (siteAnswered) await releaseCopyAfterStop(row)
}

/** The live preview the site answered must be the one asked for. */
function readSummary(row: LivePreview, s: LivePreviewSummary | undefined): LivePreviewSummary | null {
  if (!s || s.livePreviewId !== row.id || s.workspaceId !== row.workspaceId || s.personId !== row.userId ||
      s.branch !== row.branch || s.onMain !== row.onMain) return null
  return s
}

export function detailFor(siteName: string) {
  return (state: LivePreviewSummary['state']): string | null => {
    if (state.state === 'paused') return pausedDetail(state.reason, state.signal, siteName)
    if (state.state === 'stopped') return stoppedDetail(state.reason, siteName, state.signal)
    return null
  }
}

async function bringUp(row: LivePreview, ws: ReachedWorkspace, site: SiteChoice): Promise<void> {
  let copy: LivePreviewCopyRef
  if (row.copyKind === 'BUNDLE') {
    const home = await prisma.executionSite.findUnique({ where: { id: ws.executionSiteId }, select: { label: true } })
    const carried = await carryBundle({
      source: sourceOf(ws.ref, row.onMain, row.branch), prerequisites: [],
      from: { siteId: ws.logicalSiteId, executionSiteId: ws.executionSiteId, name: home?.label ?? 'its site' },
      to: { siteId: site.siteId, executionSiteId: site.executionSiteId, name: site.name },
      direction: 'toPreview', personId: row.userId, workspaceId: row.workspaceId, branch: row.branch,
    })
    if (!carried.carried) throw new HttpError(409, `${row.branch} has nothing to send. ${NOTHING}`)
    await prisma.livePreview.updateMany({ where: { id: row.id, state: { in: LIVE } }, data: { bundleId: carried.bundleId, headCommit: carried.head } })
    copy = { kind: 'bundle', copyId: row.copyId, bundleId: carried.bundleId }
  } else {
    copy = { kind: row.copyKind === 'MAIN' ? 'main' : 'branch', copyId: row.copyId }
  }
  const answer = await askSite(site.siteId, LIVE_PREVIEW_METHODS.open, {
    livePreviewId: row.id, projectId: row.projectId, personId: row.userId, workspace: ws.ref, branch: row.branch,
    onMain: row.onMain, copy,
  }, OPEN_TIMEOUT_MS)
  if (!answer.ok) {
    // The branch already has one there that hq lost: stopped, so the next start opens it afresh.
    if (answer.refusal.code === 'branchOpen') for (const id of answer.refusal.livePreviewIds ?? []) await stopOnSite(site.siteId, id, 'person')
    // The site has no such copy: hq's row of it is let go, so the next start makes a fresh one (`copyForBranch`).
    if (answer.refusal.code === 'noCopy' && row.copyKind === 'BRANCH' && row.branchId) {
      await prisma.branchCopy.updateMany({ where: { branchId: row.branchId, folderId: row.copyId, state: 'READY' }, data: { state: 'REMOVED', removedAt: new Date() } })
    }
    throw refusalError(answer.refusal, site.name, row.branch)
  }
  const summary = readSummary(row, answer.livePreview)
  if (!summary) throw siteAnswerUnreadable(site.name)
  const moved = await moveLivePreview(row.id, moveFromSummary(summary, detailFor(site.name)))
  // Stopped while the site was opening it: the site is told to stop it too.
  if (!moved) await stopOnSite(site.siteId, row.id, 'person')
  // The site answered, but the live preview did not start there (its container failed): a failure, in HQ's words.
  if (summary.state.state === 'stopped') throw new HttpError(502, openedStoppedWords(summary.state, site.name))
}

/** Why a live preview the site answered as stopped did not start: HQ's sentence for its reason, never the site's. */
export function openedStoppedWords(state: Extract<LivePreviewSummary['state'], { state: 'stopped' }>, siteName: string): string {
  return `${stoppedDetail(state.reason, siteName, state.signal)} ${NOTHING}`
}

export async function startLivePreview(userId: string, input: StartLivePreviewInput): Promise<LivePreviewView> {
  const ws = await reachWorkspace(input?.workspaceId, userId, 'work')
  if (!liveAppsHaveAddress()) throw new HttpError(409, NO_ADDRESS, { code: 'noAddress' })
  let target = await targetOf(ws, input.branchId)
  if (await needsCopy(ws, target, input.executionSiteId)) {
    await copyForBranch(ws, target.branchId!)
    target = await targetOf(ws, input.branchId)
  }
  const begun = await begin(ws, target, userId, input.executionSiteId)
  if (!begun.fresh || !begun.site) {
    await touchLivePreview(begun.row.id)
    return viewOf(begun.row, userId, true)
  }
  const { row, site } = begun
  emitLivePreviewChange(row, 'state')
  try {
    await bringUp(row, ws, site)
  } catch (err) {
    if (err instanceof SiteSilent) {
      await failed(row, `${site.name} stopped answering while the live preview started. Nothing was left running; start it again once ${site.name} is back.`, false)
      throw siteSilent(site.name)
    }
    if (err instanceof SiteFailed) {
      await failed(row, `${site.name} could not start it: it may need upgrading.`)
      throw new HttpError(502, `${site.name} could not start a live preview; it may need upgrading. ${NOTHING}`)
    }
    await failed(row, err instanceof HttpError ? err.message : stoppedDetail('failed', site.name))
    throw err
  }
  const now = await prisma.livePreview.findUnique({ where: { id: row.id } })
  // The person sees the app they started it for, not an empty live preview.
  if (now) await startAppOnOpen(now, { siteId: site.siteId, name: site.name })
  return viewOf(now ?? row, userId, true)
}
