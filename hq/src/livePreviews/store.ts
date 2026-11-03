/**
 * hq's rows of live previews (live preview spec section 4): which are live, the one on a branch, the ones on a site,
 * and moving a row as the site says. At most one live preview not STOPPED per workspace and branch: every write that
 * makes one takes the branch's lock first (`lockSlot`), and checks inside it.
 */
import { prisma } from 'wasp/server'
import type { LivePreview, Prisma } from '@prisma/client'
import { emitLivePreviewChange } from './socket'
import type { LivePreviewSummary } from '@agenthix/core'

export const LIVE: LivePreview['state'][] = ['STARTING', 'RUNNING', 'PAUSED']

/** A branch by hq's id (a rename keeps it), or the workspace's `main` (null). */
export type Slot = { workspaceId: string; branchId: string | null }

/** Serialises opening and stopping the live preview of one workspace's branch (or `main`), across hq's processes. */
export async function lockSlot(tx: Prisma.TransactionClient, slot: Slot): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`livePreview:${slot.workspaceId}:${slot.branchId ?? 'main'}`}, 0))`
}

export function livePreviewOn(db: Prisma.TransactionClient | typeof prisma, slot: Slot) {
  const where = slot.branchId ? { branchId: slot.branchId } : { branchId: null, onMain: true }
  return db.livePreview.findFirst({ where: { workspaceId: slot.workspaceId, ...where, state: { in: LIVE } }, orderBy: { openedAt: 'desc' } })
}

/** The branch's (or `main`'s) latest live preview that stopped, for why it stopped. */
export function lastStoppedOn(db: Prisma.TransactionClient | typeof prisma, slot: Slot) {
  const where = slot.branchId ? { branchId: slot.branchId } : { branchId: null, onMain: true }
  return db.livePreview.findFirst({
    where: { workspaceId: slot.workspaceId, ...where, state: 'STOPPED' },
    orderBy: [{ stoppedAt: 'desc' }, { openedAt: 'desc' }],
    select: { reason: true, detail: true, stoppedAt: true, since: true },
  })
}

export function livePreviewsOnSite(executionSiteId: string) {
  return prisma.livePreview.findMany({ where: { executionSiteId, state: { in: LIVE } }, orderBy: { openedAt: 'asc' } })
}

export function livePreviewById(id: unknown): Promise<LivePreview | null> {
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return Promise.resolve(null)
  return prisma.livePreview.findUnique({ where: { id } })
}

const STATE: Record<LivePreviewSummary['state']['state'], LivePreview['state']> = {
  starting: 'STARTING', running: 'RUNNING', paused: 'PAUSED', stopped: 'STOPPED',
}

export type Move = Pick<Prisma.LivePreviewUpdateInput, 'state' | 'reason' | 'signal' | 'detail' | 'since' | 'stoppedAt' | 'headCommit'>

/**
 * A row's fields from the site's summary. `detailOf` writes hq's own sentence for a pause or a stop; the site's is
 * never kept. A summary whose time does not read keeps hq's clock.
 */
export function moveFromSummary(s: LivePreviewSummary, detailOf: (s: LivePreviewSummary['state']) => string | null): Move {
  const since = new Date(s.state.since)
  const at = Number.isNaN(since.getTime()) ? new Date() : since
  const state = STATE[s.state.state]
  const paused = s.state.state === 'paused' || s.state.state === 'stopped' ? s.state : null
  return {
    state,
    reason: paused?.reason ?? null,
    signal: paused?.signal ?? null,
    detail: paused ? detailOf(s.state) : null,
    since: at,
    ...(state === 'STOPPED' ? { stoppedAt: at } : {}),
    ...(typeof s.head === 'string' ? { headCommit: s.head } : {}),
  }
}

/**
 * Moves a live row and tells the workspace's screens. A row already STOPPED stays stopped: a late `state` from the
 * site never brings it back. Answers the row as it is now, or null when it had stopped already.
 */
export async function moveLivePreview(id: string, move: Move): Promise<LivePreview | null> {
  const { count } = await prisma.livePreview.updateMany({ where: { id, state: { in: LIVE } }, data: move as Prisma.LivePreviewUpdateManyMutationInput })
  if (!count) return null
  const row = await prisma.livePreview.findUnique({ where: { id } })
  if (row) emitLivePreviewChange(row, 'state')
  return row
}

/** Someone has it open, or a run went on its branch: the idle stop counts from now. */
export async function touchLivePreview(id: string, now = new Date()): Promise<void> {
  await prisma.livePreview.updateMany({ where: { id, state: { in: LIVE } }, data: { lastUsedAt: now } })
}
