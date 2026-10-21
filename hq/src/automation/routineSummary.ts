/**
 * A routine as its lists show it (spec §3): its repeat, person, agent, where
 * its rounds start, whether the reader may manage it, and its last rounds'
 * states for the squares. Shared by a project's Routines view, one routine,
 * and the Projects screen's Routines view.
 */
import { prisma } from 'wasp/server'
import type { Routine } from '@prisma/client'
import { usernames } from '../projects/onBehalfOfOperations'
import { DEFAULT_BOARD_COLUMNS, PROJECT_TASKS_NAME, findColumn, parseColumns } from '../projects/boardColumns'
import { LAST_ROUNDS, type RoundState, type RoutineSummary } from '../shared/routineTypes'
import { mayManageRoutine } from './routines'
import { roundState } from './roundState'
import { parseScheduleRule } from './scheduleRule'

/** Newest first: by round time, a round unlinked from its time after them, then by when it was made. */
export const ROUNDS_NEWEST_FIRST = [{ roundAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }] as const

/** A routine's last rounds' states, oldest first — the order its squares are drawn in. */
export async function lastRoundStates(routineId: string, now: Date): Promise<RoundState[]> {
  const rounds = await prisma.task.findMany({
    where: { routineId },
    orderBy: [...ROUNDS_NEWEST_FIRST],
    take: LAST_ROUNDS,
    select: { status: true, runState: true, roundAt: true },
  })
  return rounds.map(r => roundState(r, now)).reverse()
}

export async function summarise(routines: Routine[], userId: string, now: Date = new Date()): Promise<RoutineSummary[]> {
  const names = await usernames([...new Set(routines.map(r => r.onBehalfOfUserId))])
  const agentIds = [...new Set(routines.map(r => r.assignedAgentId).filter((a): a is string => !!a))]
  const boardIds = [...new Set(routines.map(r => r.boardId).filter((b): b is string => !!b))]
  const [agents, boards] = await Promise.all([
    prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } }),
    prisma.board.findMany({ where: { id: { in: boardIds } }, select: { id: true, name: true, columns: true } }),
  ])
  const agentName = new Map(agents.map(a => [a.id, a.name]))
  const boardOf = new Map(boards.map(b => [b.id, b]))
  return Promise.all(routines.map(async r => ({
    id: r.id,
    title: r.title,
    rule: parseScheduleRule(r.scheduleRule),
    timezone: r.scheduleTimezone,
    enabled: r.enabled,
    pausedReason: r.pausedReason,
    nextRoundAt: r.enabled ? r.nextRoundAt?.toISOString() ?? null : null,
    onBehalfOf: { userId: r.onBehalfOfUserId, username: names.get(r.onBehalfOfUserId) ?? null },
    agentName: r.assignedAgentId ? agentName.get(r.assignedAgentId) ?? null : null,
    place: placeOf(r, boardOf),
    canManage: await mayManageRoutine(r, userId),
    lastRounds: await lastRoundStates(r.id, now),
  })))
}

/**
 * Where its rounds start, in words: "Bugs › In Review", "Bugs › Backlog", or
 * Project Tasks' when it names no board — or names one that has gone, where its
 * rounds then start (routineTemplate.ts's roundFields).
 */
function placeOf(r: Routine, boards: Map<string, { name: string; columns: unknown }>): string {
  const board = r.boardId ? boards.get(r.boardId) : undefined
  if (r.boardId && !board) return `${PROJECT_TASKS_NAME} › Backlog`
  const column = r.column ? findColumn(parseColumns(board?.columns ?? DEFAULT_BOARD_COLUMNS), r.column)?.label ?? r.column : 'Backlog'
  return `${board?.name ?? PROJECT_TASKS_NAME} › ${column}`
}
