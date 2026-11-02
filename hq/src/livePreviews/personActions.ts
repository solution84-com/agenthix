/**
 * What a person does with a live preview from the workspace view, besides starting and stopping it: resume one the
 * guard paused, reload its view, switch *Auto*, say yes to a service or an install script, and keep it marked as in use
 * while they have it open. Each needs a Member or Admin of the project (or the owner of their own storage); a Viewer
 * reads it and does nothing. The site checks each request against its own record.
 */
import { HttpError, prisma } from 'wasp/server'
import type { LivePreview } from '@prisma/client'
import { LIVE_PREVIEW_METHODS, parseLivePreviewRequest, type LivePreviewActOutcome, type LivePreviewRequest } from '@agenthix/core'
import { reachWorkspace } from '../branches/workspaceAccess'
import { personById } from '../server/identity/people'
import { askSite, SiteFailed, SiteSilent } from './siteAsk'
import { LIVE, livePreviewById, moveFromSummary, moveLivePreview, touchLivePreview } from './store'
import { detailFor } from './opening'
import { forgetBlocked, isBlocked } from './questions'
import { emitLivePreviewAuto, emitLivePreviewChange, emitLivePreviewReload } from './socket'
import { NOTHING, refusalError, siteSilent } from './words'
import { viewOf } from './views'
import type { LivePreviewView } from './types'

export type Reached = { row: LivePreview; site: { siteId: string; name: string } }

/** The live preview, for a person who may work in its workspace; `read` for one who may only read it. */
export async function reachLivePreview(userId: string, livePreviewId: unknown, use: 'read' | 'work'): Promise<Reached & { canAct: boolean }> {
  const row = await livePreviewById(livePreviewId)
  if (!row) throw new HttpError(404, `This live preview is not there. ${NOTHING}`)
  const ws = await reachWorkspace(row.workspaceId, userId, use === 'work' ? 'work' : 'read')
  const site = await prisma.executionSite.findUnique({ where: { id: row.executionSiteId }, select: { siteId: true, label: true } })
  if (!site) throw new HttpError(404, `The site this live preview ran on is gone. ${NOTHING}`)
  return { row, site: { siteId: site.siteId, name: site.label }, canAct: ws.canAct }
}

function requireLive(row: LivePreview): void {
  if (!LIVE.includes(row.state)) throw new HttpError(409, `This live preview has stopped. Start it again from Live preview. ${NOTHING}`)
}

async function asked<T>(site: Reached['site'], work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof SiteSilent) throw siteSilent(site.name)
    if (err instanceof SiteFailed) throw new HttpError(502, `${site.name} could not do that; it may need upgrading. ${NOTHING}`)
    throw err
  }
}

export async function getLivePreview(userId: string, livePreviewId: unknown): Promise<LivePreviewView> {
  const { row, canAct } = await reachLivePreview(userId, livePreviewId, 'read')
  return viewOf(row, userId, canAct)
}

/** *Resume*, after the person read what the guard found. A pause for a lost line carries on by itself. */
export async function resumeLivePreview(userId: string, livePreviewId: unknown): Promise<LivePreviewView> {
  const { row, site } = await reachLivePreview(userId, livePreviewId, 'work')
  requireLive(row)
  if (row.state !== 'PAUSED' || row.reason !== 'guard') {
    throw new HttpError(409, `Only a live preview the guard paused is resumed here; one paused for a lost line carries on by itself. ${NOTHING}`)
  }
  const answer = await asked(site, () => askSite(site.siteId, LIVE_PREVIEW_METHODS.resume, { livePreviewId: row.id, personId: userId }))
  if (!answer.ok) throw refusalError(answer.refusal, site.name, row.branch)
  const s = answer.livePreview
  const moved = s?.livePreviewId === row.id ? await moveLivePreview(row.id, moveFromSummary(s, detailFor(site.name))) : null
  return viewOf(moved ?? row, userId, true)
}

/** How often a person's *in use* counts for one live preview; repeats within it are answered and do nothing. */
export const IN_USE_AT_MOST_MS = 30_000
const inUseSeen = new Map<string, number>()

/**
 * The screen has it open: called while it is shown, so the idle stop counts from the last time anyone looked. A repeat
 * from the same person within `IN_USE_AT_MOST_MS` of one that counted reads nothing and writes nothing: that person
 * was let in moments ago, and the idle stop counts in minutes.
 */
export async function markLivePreviewInUse(userId: string, livePreviewId: unknown, now = Date.now()): Promise<void> {
  const key = typeof livePreviewId === 'string' ? `${userId}\u0000${livePreviewId}` : null
  const seen = key ? inUseSeen.get(key) : undefined
  if (seen !== undefined && now - seen < IN_USE_AT_MOST_MS) return
  const { row } = await reachLivePreview(userId, livePreviewId, 'read')
  await touchLivePreview(row.id, new Date(now))
  for (const [k, at] of inUseSeen) if (now - at >= IN_USE_AT_MOST_MS) inUseSeen.delete(k)
  inUseSeen.set(key!, now)
}

export function __resetInUseForTests(): void {
  inUseSeen.clear()
}

/** *Reload*: everyone who has it open reloads its view. */
export async function reloadLivePreview(userId: string, livePreviewId: unknown): Promise<void> {
  const { row } = await reachLivePreview(userId, livePreviewId, 'work')
  requireLive(row)
  emitLivePreviewReload(row, (await personById(userId)).name)
}

export async function setLivePreviewAuto(userId: string, livePreviewId: unknown, auto: unknown): Promise<void> {
  if (typeof auto !== 'boolean') throw new HttpError(400, `Auto is on or off. ${NOTHING}`)
  const { row } = await reachLivePreview(userId, livePreviewId, 'work')
  requireLive(row)
  await prisma.livePreview.update({ where: { id: row.id }, data: { autoReload: auto } })
  emitLivePreviewAuto(row, auto)
}

/** Asks the site to act on the person's request; throws in words when it refuses or is silent. */
export async function actOnSite(reached: Reached, userId: string, request: LivePreviewRequest): Promise<LivePreviewActOutcome> {
  const { row, site } = reached
  requireLive(row)
  if (row.state === 'PAUSED') throw new HttpError(409, `This live preview is paused. Resume it first. ${NOTHING}`)
  const answer = await asked(site, () => askSite(site.siteId, LIVE_PREVIEW_METHODS.act, { livePreviewId: row.id, personId: userId, request }))
  if (!answer.ok) throw refusalError(answer.refusal, site.name, row.branch)
  if (answer.outcome?.kind !== request.kind) throw new HttpError(502, `${site.name} gave an answer HQ could not read. ${NOTHING}`)
  return answer.outcome
}

/** A yes to a waiting service, or to a blocked package's install script, as the question named it. */
export async function answerLivePreviewQuestion(userId: string, livePreviewId: unknown, request: unknown): Promise<void> {
  const parsed = parseLivePreviewRequest(request)
  if (!parsed || parsed.kind === 'app.open') throw new HttpError(400, `That is not a question this live preview asked. ${NOTHING}`)
  const reached = await reachLivePreview(userId, livePreviewId, 'work')
  if (parsed.kind === 'package.use' && !isBlocked(reached.row.id, parsed)) {
    throw new HttpError(409, `Nothing in this live preview is waiting on that package any more. ${NOTHING}`)
  }
  await actOnSite(reached, userId, parsed)
  if (parsed.kind === 'package.use') forgetBlocked(reached.row.id, parsed)
  emitLivePreviewChange(reached.row, 'question')
}
