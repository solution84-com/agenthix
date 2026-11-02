/**
 * A live preview's life on this site (live preview spec section 4, *States*): its container started and watched,
 * paused and let run again, stopped with nothing of it left running. Every move is written through the store, then
 * acted on; a container that cannot be paused is removed (fail closed) and made again on resume.
 */
import {
  BRANCH_WORK_SITE_BUDGET_MS, LIVE_PREVIEW_EVENTS,
  type GuardSignal, type LivePreviewPauseReason, type LivePreviewStopReason,
} from '@agenthix/core'
import { hqConnectionManager } from '../hq/hqConnection'
import { Logger } from '../utils/logger'
import { lastAuthors } from './livePreviewActivity'
import { copyPlaceOf, ownCopyHead, previewHelper, removeOwnCopy } from './livePreviewCopies'
import type { LivePreviewRow } from './livePreviewRows'
import { apps, currentGuard } from './livePreviewRuntime'
import { seams } from './livePreviewSeams'
import { changeLivePreview, livePreviewRow, moveState, onLivePreviewChange } from './livePreviewStore'
import { forgetPreviewMask } from './secrets/previewMasks'
import {
  ContainerRefused, expectContainers, pauseContainers, removeEverything, startContainer, stopContainers, unpauseContainers,
} from './container/container'

const logger = new Logger('livePreviews')

onLivePreviewChange(row => apps.previewChanged(row.id, row.state))

const now = () => new Date().toISOString()

/** Makes the live preview's container and starts watching it; throws when either cannot be done. */
export async function startContainers(row: LivePreviewRow): Promise<void> {
  const guard = currentGuard()
  if (!guard?.healthy) throw new Error('The live-preview guard is not running.')
  const made = expectContainers(row.id)
  try {
    await startContainer({ id: row.id, workspaceId: row.workspaceId, personId: row.personId, projectId: row.projectId }, copyPlaceOf(row))
    await guard.watch({ id: row.id, projectId: row.projectId, paused: false })
  } finally {
    made()
  }
}

const CHANGED_WHILE_PAUSED = 'Its container changed while it was paused, so it was not let run again and the live preview stopped. Its branch and work are untouched.'
const NOT_AGAIN = 'This live preview could not run again after its pause, so it stopped. Its branch and work are untouched. Start it again.'

async function dropContainers(id: string): Promise<void> {
  currentGuard()?.unwatch(id)
  await seams.services.stopAll(id).catch(err => logger.warn(`Could not stop the services of live preview ${id}: ${String(err)}`))
  await removeEverything(id)
}

/** Pauses a running live preview and its containers. Null when there is none, or it has stopped. */
export async function pausePreview(id: string, reason: LivePreviewPauseReason, detail: string, signal: GuardSignal | null = null): Promise<LivePreviewRow | null> {
  const paused = await moveState(id, row => (row.state.state === 'paused' ? null : { state: 'paused', since: now(), reason, signal, detail }))
  if (!paused || paused.containersRemoved) return paused
  try {
    await pauseContainers(id)
  } catch (err) {
    logger.error(`Could not pause the containers of live preview ${id}; removing them: ${err instanceof Error ? err.message : String(err)}`)
    await dropContainers(id).catch(() => {})
    await changeLivePreview(id, cur => ({ row: cur && cur.state.state === 'paused' ? { ...cur, containersRemoved: true } : null, result: null }))
  }
  return livePreviewRow(id)
}

/** Lets a paused live preview run again: its containers let run, or made again when they were removed. */
export async function resumePreview(row: LivePreviewRow): Promise<LivePreviewRow | null> {
  try {
    if (row.containersRemoved) await startContainers(row)
    else await unpauseContainers(row.id)
  } catch (err) {
    logger.error(`Live preview ${row.id} could not run again: ${err instanceof Error ? err.message : String(err)}`)
    // Only a paused container that no longer matches its template is the guard's finding; any other failure to come
    // back (a container that could not be made again, Docker refusing) is a start that failed.
    if (!row.containersRemoved && err instanceof ContainerRefused) await stopPreview(row.id, 'guard', CHANGED_WHILE_PAUSED, 'offTemplate')
    else await stopPreview(row.id, 'failed', NOT_AGAIN)
    return null
  }
  return moveState(row.id, cur => (cur.state.state === 'paused' ? { state: 'running', since: now() } : null))
    .then(async moved => {
      if (moved?.containersRemoved) await changeLivePreview(row.id, cur => ({ row: cur ? { ...cur, containersRemoved: false } : null, result: null }))
      return livePreviewRow(row.id)
    })
}

/**
 * For a live preview's own copy on another site: anything uncommitted committed as *Work in progress* (when a run's
 * author is known), and whether commits remain to go back since the last bundle made for them. Tells hq when the
 * branch moved.
 */
async function settleOwnCopy(row: LivePreviewRow): Promise<{ pendingBack: boolean }> {
  const who = lastAuthors(row.workspaceId, row.branch)
  if (who) {
    const message = `Work in progress\n${who.onBehalfOf ? `\nOn-behalf-of: ${who.onBehalfOf.name} <${who.onBehalfOf.email}>\n` : ''}`
    await previewHelper(
      { workspaceId: row.workspaceId, copy: { dir: copyPlaceOf(row).hostDir, readOnly: false }, network: false, timeoutMs: BRANCH_WORK_SITE_BUDGET_MS },
      { op: 'copyCommit', branch: row.branch, message, author: who.author, at: now() }, `the work-in-progress commit of live preview ${row.id}`,
    )
  }
  const head = await ownCopyHead(row)
  if (!head) return { pendingBack: true }
  if (head !== row.headCommit) await reportMoved(row, head, 'run_end', null)
  const back = row.pending?.bundledHead ?? row.baseCommit
  return { pendingBack: head !== back }
}

/** Tells hq a live preview's own copy moved, and remembers the head it was told. */
export async function reportMoved(row: LivePreviewRow, head: string, cause: 'sweep' | 'run_end' | 'site_back', runId: string | null): Promise<void> {
  const previous = row.headCommit ?? row.baseCommit ?? head
  hqConnectionManager.sendEvent(LIVE_PREVIEW_EVENTS.branchMoved, { livePreviewId: row.id, branch: row.branch, head, previous, cause, runId })
  await changeLivePreview(row.id, cur => ({ row: cur ? { ...cur, headCommit: head } : null, result: null }))
}

/**
 * Stops a live preview: recorded first, then its containers and services removed and checked. A copy made for it
 * goes too, except a `bundle` copy whose commits are not all back yet (`pendingBack`): it stays until hq has brought
 * them back and stops it again. Answers whether it was live, and whether commits wait.
 */
export async function stopPreview(
  id: string, reason: LivePreviewStopReason, detail: string, signal: GuardSignal | null = null,
): Promise<{ stopped: boolean; pendingBack: boolean }> {
  const before = await livePreviewRow(id)
  if (!before || before.state.state === 'stopped') return { stopped: false, pendingBack: false }
  const stopped = await moveState(id, () => ({ state: 'stopped', since: now(), reason, signal, detail }))
  try {
    await dropContainers(id)
    await stopContainers(id)
  } catch (err) {
    logger.error(`Something of live preview ${id} is still running on this site: ${err instanceof Error ? err.message : String(err)}`)
  }
  seams.installs.forget(id)
  // After the apps' last events were masked: they read what was handed when they were told.
  forgetPreviewMask(id)
  const row = (await livePreviewRow(id)) ?? before
  let pendingBack = false
  if (row.copyKind === 'bundle') pendingBack = (await settleOwnCopy(row).catch(() => ({ pendingBack: true }))).pendingBack
  if (!pendingBack) await removeOwnCopy(row).catch(err => logger.warn(`Could not remove the copy of live preview ${id}: ${String(err)}`))
  await changeLivePreview(id, cur => ({
    row: cur ? { ...cur, pending: pendingBack ? { ...(cur.pending ?? {}), bundledHead: cur.pending?.bundledHead ?? cur.baseCommit ?? undefined } : null } : null,
    result: null,
  }))
  if (stopped) logger.info(`Live preview ${id} on workspace ${row.workspaceId} stopped (${reason}).`)
  return { stopped: stopped !== null, pendingBack }
}

/** A stopped live preview's own copy, kept for its commits, once hq has them: removed. */
export async function finishOwnCopy(id: string): Promise<{ pendingBack: boolean }> {
  const row = await livePreviewRow(id)
  if (!row || row.copyKind !== 'bundle' || !row.pending) return { pendingBack: false }
  const head = await ownCopyHead(row)
  if (head && head !== (row.pending.bundledHead ?? row.baseCommit)) return { pendingBack: true }
  await removeOwnCopy(row)
  await changeLivePreview(id, cur => ({ row: cur ? { ...cur, pending: null } : null, result: null }))
  return { pendingBack: false }
}
