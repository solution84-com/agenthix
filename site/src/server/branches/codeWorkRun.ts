/**
 * A run on a code workspace (live preview spec, *Commits, and the branch coming back*): its working folder is its
 * branch's copy, checked against the site's own record before the run starts; while it goes, its branch is brought
 * back every minute; at its end, anything left uncommitted is committed as *Work in progress* and the branch brought
 * back once more. A copy whose commits may not all be back is marked `backPending`, and a start of the site brings
 * each of those back. Every time a branch moves this way, hq is told (`branch.back`).
 */
import {
  BRANCH_BACK_EVENT, NO_FEATURE_SWITCHES,
  type BranchBackCause, type BranchBackResult, type FeatureSwitches, type GitPerson, type RunCodeWork, type WorkspaceRepoRef,
} from '@agenthix/core'
import { prisma } from '#db'
import { ReadableRunError } from '../../agents/runtime/readableRunError'
import { hqConnectionManager } from '../hq/hqConnection'
import { Logger } from '../utils/logger'
import { copyDirOf, copyState, inTurn, placeWorkspace, requireCopy, type Placed } from './branchCalls'
import { bringBackCopy, commitInCopy, withOnBehalfOf } from './branchWorkMethods'
import { livePreviewRunEnds, livePreviewRunStarts, resolveLivePreviewCopy, sweepLivePreviewCopy } from '../livePreviews/livePreviewRuns'

const logger = new Logger('branches')

export const SWEEP_MS = 60_000
export const WORK_IN_PROGRESS = 'Work in progress\n'

export type CodeWorkRun = {
  runId: string
  placed: Placed
  copyId: string
  branch: string
  /** The copy's folder on this disk. */
  copyDir: string
  /** Whom the *Work in progress* commit at the run's end names, as hq gave them: the run's agent, for the person. */
  author: GitPerson
  onBehalfOf: GitPerson | null
  /** Set when the run works in a live preview's own copy on this site (copy kind `bundle`): see `livePreviewRuns.ts`. */
  livePreviewId?: string
}

/**
 * The run's code work, checked: the copy is in the storage the run works in, the site's record says it is this
 * workspace's copy of this branch, and its folder is there. A refusal fails the run with words a person can read.
 * A run in a live preview's own copy is refused while the live preview is off for the run's switches (`features`).
 */
export async function resolveCodeWork(
  runId: string, codeWork: RunCodeWork, boundary: { ownerType: string; ownerId: string }, features: FeatureSwitches = NO_FEATURE_SWITCHES,
): Promise<CodeWorkRun> {
  if (codeWork.livePreviewId) return resolveLivePreviewCopy(runId, codeWork, boundary, features)
  const ref: WorkspaceRepoRef = codeWork.workspace
  const refused = new ReadableRunError(
    `The working copy of branch ${codeWork.branch} is not on this site, or is not this work's. ` +
    'Start the work again from HQ, which makes a fresh copy. Nothing was changed.',
  )
  if (ref.ownerType !== boundary.ownerType || ref.ownerId !== boundary.ownerId) throw refused
  const placed = await placeWorkspace(ref, 'run.dispatch').catch(() => { throw refused })
  await requireCopy(placed, codeWork.copyId, codeWork.branch, 'run.dispatch').catch(() => { throw refused })
  const copyDir = copyDirOf(placed, codeWork.copyId)
  if (!(await copyState(placed.owner, codeWork.copyId)).git) throw refused
  return { runId, placed, copyId: codeWork.copyId, branch: codeWork.branch, copyDir, author: codeWork.author, onBehalfOf: codeWork.onBehalfOf }
}

function tell(run: { placed: Placed; copyId: string; branch: string }, cause: BranchBackCause, back: BranchBackResult, runId: string | null): void {
  if (!back.moved) return
  hqConnectionManager.sendEvent(BRANCH_BACK_EVENT, { workspace: run.placed.ref, copyId: run.copyId, branch: run.branch, cause, back, runId })
}

/** The branch's name now, by the site's record: a rename while the run goes moves it. */
async function branchNow(copyId: string): Promise<string | null> {
  const row = await prisma.branchCopy.findUnique({ where: { id: copyId }, select: { branch: true } })
  return row?.branch ?? null
}

async function bringBackFor(run: CodeWorkRun, cause: BranchBackCause, commitFirst: boolean): Promise<void> {
  await inTurn(run.placed.ref.workspaceId, async () => {
    const branch = await branchNow(run.copyId)
    if (!branch) return
    const current = { ...run, branch }
    if (commitFirst) {
      const made = await commitInCopy(run.placed, run.copyId, branch, withOnBehalfOf(WORK_IN_PROGRESS, run.onBehalfOf), run.author, 'run.end')
      // A merge from main whose clashes are not resolved yet stays under way, uncommitted, for the next run.
      if (!made.made && made.clashesLeft) logger.info(`Branch ${branch} keeps a merge from main under way: ${made.clashesLeft.length} files still clash`)
    }
    tell(current, cause, await bringBackCopy(run.placed, run.copyId, branch, cause === 'sweep' ? 'run.sweep' : 'run.end'), run.runId)
  })
}

type Going = { runs: number; timer: ReturnType<typeof setInterval>; busy: boolean }
const going = new Map<string, Going>()

/** The run has started on its copy: the copy is marked, and swept every minute while any run on it goes. */
export async function startCodeWork(run: CodeWorkRun, sweepMs: number = SWEEP_MS): Promise<void> {
  await livePreviewRunStarts(run)
  if (run.livePreviewId) return startLivePreviewSweep(run, sweepMs)
  await prisma.branchCopy.update({ where: { id: run.copyId }, data: { backPending: true } })
  const now = going.get(run.copyId)
  if (now) { now.runs++; return }
  const entry: Going = { runs: 1, busy: false, timer: setInterval(() => {
    if (entry.busy) return
    entry.busy = true
    bringBackFor(run, 'sweep', false)
      .catch(err => logger.warn(`Bringing back branch ${run.branch} on the sweep failed: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => { entry.busy = false })
  }, sweepMs) }
  entry.timer.unref?.()
  going.set(run.copyId, entry)
}

/**
 * The run has ended: with no other run on the copy, what was left is committed and the branch brought back, and the
 * copy is no longer marked once that worked. Never throws: a failure leaves the mark, for the next run or start.
 */
export async function endCodeWork(run: CodeWorkRun): Promise<void> {
  await livePreviewRunEnds(run).catch(err => logger.warn(`Ending the run on live preview ${run.livePreviewId ?? ''} failed: ${String(err)}`))
  const entry = going.get(run.copyId)
  if (run.livePreviewId) {
    if (entry && --entry.runs <= 0) { clearInterval(entry.timer); going.delete(run.copyId) }
    return
  }
  const last = !entry || --entry.runs <= 0
  if (last && entry) { clearInterval(entry.timer); going.delete(run.copyId) }
  try {
    await bringBackFor(run, 'run_end', last)
    if (last) await prisma.branchCopy.updateMany({ where: { id: run.copyId }, data: { backPending: false } })
  } catch (err) {
    logger.warn(`Bringing back branch ${run.branch} at the run's end failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** A run in a live preview's own copy: every minute, a moved branch is told to hq, which brings it back by bundle. */
function startLivePreviewSweep(run: CodeWorkRun, sweepMs: number): void {
  const now = going.get(run.copyId)
  if (now) { now.runs++; return }
  const entry: Going = { runs: 1, busy: false, timer: setInterval(() => {
    if (entry.busy) return
    entry.busy = true
    sweepLivePreviewCopy(run).catch(() => {}).finally(() => { entry.busy = false })
  }, sweepMs) }
  entry.timer.unref?.()
  going.set(run.copyId, entry)
}

/** After a start of the site: every copy whose commits may not all be back is brought back. */
export async function bringBackPending(): Promise<number> {
  const rows = await prisma.branchCopy.findMany({ where: { backPending: true } })
  let done = 0
  for (const row of rows) {
    if (going.has(row.id)) continue
    try {
      const placed = await placeWorkspace({ ownerType: row.ownerType, ownerId: row.ownerId, workspaceId: row.workspaceId }, 'site.start')
      await inTurn(row.workspaceId, async () => {
        const back = await bringBackCopy(placed, row.id, row.branch, 'site.start')
        tell({ placed, copyId: row.id, branch: row.branch }, 'site_back', back, null)
      })
      await prisma.branchCopy.update({ where: { id: row.id }, data: { backPending: false } })
      done++
    } catch (err) {
      logger.warn(`Bringing back copy ${row.id} after the site started failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return done
}

/** For tests: forget the runs going. */
export function resetCodeWorkRuns(): void {
  for (const g of going.values()) clearInterval(g.timer)
  going.clear()
}
