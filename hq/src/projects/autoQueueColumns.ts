/**
 * Columns that queue work by themselves: whether a task lands in one, and what
 * switching a column's auto-queue on or off does to the tasks in it. Who may
 * make such a change is the project's role (adr-0102), checked by the callers.
 */
import { withExecutionState } from './executionState'
import { prisma } from 'wasp/server'
import { nudgeScheduler } from '../automation/schedulerNudge'
import { notifyBoards } from './boardNotify'
import type { Queuer } from './taskOnBehalfOf'
import { queuedForPulse } from './taskQueueing'
import { notBeforeItsTime } from './notBeforeItsTime'
import { parseColumns, resolveColumn } from './boardColumns'

/** Whether a new task placed in this column of this board (named loosely, as an agent may) is queued on arrival. */
export async function landsInAutoQueueColumn(boardId: string | undefined, column: string | null | undefined): Promise<boolean> {
  if (!boardId || !column) return false
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { columns: true } })
  if (!board) return false
  const landing = resolveColumn(parseColumns(board.columns), column)
  return !!landing?.autoQueue && landing.status !== 'DONE'
}

export type AutoQueueChange = { newlyEnabled: string[]; newlyDisabled: string[] }

/** Which columns a column list switches auto-queue on or off for, compared with the board's current columns. */
export async function autoQueueChange(boardId: string, columns: unknown): Promise<AutoQueueChange | null> {
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { columns: true } })
  if (!board) return null
  const oldAutoQueue = new Map(parseColumns(board.columns).map(s => [s.name, s.autoQueue ?? false]))
  const next = parseColumns(columns)
  return {
    newlyEnabled: next.filter(s => (s.autoQueue ?? false) && !oldAutoQueue.get(s.name)).map(s => s.name),
    newlyDisabled: next.filter(s => !(s.autoQueue ?? false) && oldAutoQueue.get(s.name)).map(s => s.name),
  }
}

export function changesAutoQueue(change: AutoQueueChange | null): boolean {
  return change != null && (change.newlyEnabled.length > 0 || change.newlyDisabled.length > 0)
}

/**
 * Queues, for the pulse, the tasks with no run pending — and no start or round
 * time still to come — in columns that just turned auto-queue on, and releases the ones the column queued in columns that
 * turned it off — never one someone asked to start. `projectId`, not just
 * `boardId`: the same defence-in-depth runBoard's dispatch query carries,
 * against a task whose boardId points here but whose own projectId doesn't
 * (spec §6.4).
 */
export async function applyAutoQueueChange(
  boardId: string,
  projectId: string,
  change: AutoQueueChange,
  queuer: Queuer,
): Promise<void> {
  const { newlyEnabled, newlyDisabled } = change
  await Promise.all([
    newlyEnabled.length > 0 && prisma.task.updateMany({
      where: { boardId, projectId, column: { in: newlyEnabled }, runState: 'RUN_NONE', assignedAgentId: { not: null }, ...notBeforeItsTime(new Date()) },
      data: await queuedForPulse(projectId, queuer, 0),
    }),
    newlyDisabled.length > 0 && prisma.task.updateMany({
      where: { boardId, projectId, column: { in: newlyDisabled }, runState: { in: ['RUN_QUEUED', 'RUN_THROTTLED'] }, runStartedBy: null },
      data: withExecutionState({ runState: 'RUN_NONE', runStateReason: null }),
    }),
  ])
  await notifyBoards([boardId])
  if (newlyEnabled.length > 0) nudgeScheduler()
}
