/**
 * Opening and resuming a live preview (live preview spec section 4, *Opening one*). The organisation's sites obey hq,
 * so hq's checks admit it (the person's role, the site's setting and limit, one per branch). The site still decides
 * what only it knows: that it makes containers and its guard runs, its own setting and limit, the protections for live
 * previews, one live preview per branch here, and that the copy named is the one its own record holds.
 */
import { parseLivePreviewOpenParams, parseLivePreviewResumeParams, type LivePreviewResult } from '@agenthix/core'
import { prisma } from '#db'
import { hostFigures } from '../host/hostFigures'
import { livePreviewPart } from '../../agents/runtime/containerNetwork'
import { Logger } from '../utils/logger'
import { prepareCopy } from './livePreviewCopies'
import { startContainers, stopPreview, resumePreview } from './livePreviewLife'
import { summaryOf, type LivePreviewRow } from './livePreviewRows'
import { guardHealthy } from './livePreviewRuntime'
import { livePreviewSettings, roomForOneMore } from './livePreviewSettings'
import { changeLivePreview, liveLivePreviews, livePreviewRow, moveState, saveLivePreview, serial } from './livePreviewStore'
import {
  GUARD_DOWN, MALFORMED, NO_CONTAINERS, STOPPED, TURNED_OFF, UNKNOWN, atLimit, branchOpen, isRefused, pausedRefusal,
  protectionsDown, refuse, type Refused,
} from './livePreviewWords'

const logger = new Logger('livePreviews')

const now = () => new Date().toISOString()

/** Whether this site may start a live preview now, by what only it knows; null when it may. */
export async function siteGate(): Promise<Refused | null> {
  if (process.env.AGENT_CONTAINER_ISOLATION !== 'true') return NO_CONTAINERS
  if (!livePreviewSettings().allowed) return TURNED_OFF
  if (!guardHealthy()) return GUARD_DOWN
  let part: string | null = null
  try { part = livePreviewPart() } catch { part = null }
  if (!part) return protectionsDown('this site\'s agent address range has no part for live previews.')
  const problem = await hostFigures.livePreviewProtectionsProblem().catch(() => 'they could not be checked.')
  return problem ? protectionsDown(problem) : null
}

/** One live preview per branch here, the site's limit, and an id not used before. Call inside `serial`. */
async function fits(id: string, workspaceId: string, branch: string): Promise<Refused | null> {
  const live = await liveLivePreviews()
  const here = live.filter(r => r.workspaceId === workspaceId && r.branch === branch)
  if (here.length) return branchOpen(here.map(r => r.id))
  const { limit } = livePreviewSettings()
  if (limit !== null && !roomForOneMore(live.length)) return atLimit(limit, live.map(r => r.id))
  if (await prisma.livePreview.findUnique({ where: { id }, select: { id: true } })) return MALFORMED
  return null
}

/** A start that failed: stopped with nothing left behind, and answered as stopped, its detail saying why. */
async function failed(row: LivePreviewRow, detail: string): Promise<LivePreviewResult> {
  await stopPreview(row.id, 'failed', detail)
  const stopped = await livePreviewRow(row.id)
  return stopped ? { ok: true, livePreview: summaryOf(stopped) } : STOPPED
}

export async function livePreviewOpen(params: unknown): Promise<LivePreviewResult> {
  const p = parseLivePreviewOpenParams(params)
  if (!p) return MALFORMED
  const gate = await siteGate()
  if (gate) return gate
  const opened = await serial(async (): Promise<LivePreviewRow | Refused> => {
    const blocked = (livePreviewSettings().allowed ? null : TURNED_OFF) ?? (await fits(p.livePreviewId, p.workspace.workspaceId, p.branch))
    if (blocked) return blocked
    const at = now()
    return saveLivePreview({
      id: p.livePreviewId, projectId: p.projectId, personId: p.personId, ownerType: p.workspace.ownerType, ownerId: p.workspace.ownerId,
      workspaceId: p.workspace.workspaceId, branch: p.branch, onMain: p.onMain, copyKind: p.copy.kind, copyId: p.copy.copyId,
      baseCommit: null, headCommit: null, openedAt: at, state: { state: 'starting', since: at }, runs: [], pending: null,
      containersRemoved: false,
    })
  })
  if (isRefused(opened)) return opened
  const copy = await prepareCopy(p, opened).catch(err => {
    logger.error(`The copy of live preview ${opened.id} could not be made ready: ${err instanceof Error ? err.message : String(err)}`)
    return refuse('noCopy', 'This site could not make the copy for the live preview ready; the reason is in its log. Nothing was changed.')
  })
  if (isRefused(copy)) {
    await stopPreview(opened.id, 'failed', copy.refusal.message)
    return copy
  }
  await changeLivePreview(opened.id, cur => ({ row: cur ? { ...cur, baseCommit: copy.head, headCommit: copy.head } : null, result: null }))
  try {
    await startContainers({ ...opened, baseCommit: copy.head, headCommit: copy.head })
  } catch (err) {
    logger.error(`The container of live preview ${opened.id} could not start: ${err instanceof Error ? err.message : String(err)}`)
    return failed(opened, 'The live preview\'s container could not start on this site; the reason is in its log. Nothing was left behind.')
  }
  const running = await moveState(opened.id, cur => (cur.state.state === 'starting' ? { state: 'running', since: now() } : null))
  if (!running) return STOPPED
  logger.info(`Live preview ${opened.id} started on workspace ${opened.workspaceId}, branch ${opened.branch}.`)
  return { ok: true, livePreview: summaryOf(running) }
}

/** A live preview the guard paused, resumed by a person after reading what it found. */
export async function livePreviewResume(params: unknown): Promise<LivePreviewResult> {
  const p = parseLivePreviewResumeParams(params)
  if (!p) return MALFORMED
  const row = await livePreviewRow(p.livePreviewId)
  if (!row) return UNKNOWN
  if (row.state.state === 'stopped') return STOPPED
  if (row.state.state !== 'paused' || row.state.reason !== 'guard') {
    return row.state.state === 'paused' ? pausedRefusal(row.state.reason)
      : refuse('notGuardPaused', 'This live preview is not paused by the guard, so there is nothing to resume. Nothing was changed.')
  }
  const gate = await siteGate()
  if (gate) return gate
  const resumed = await resumePreview(row)
  if (!resumed) return STOPPED
  return { ok: true, livePreview: summaryOf(resumed) }
}
