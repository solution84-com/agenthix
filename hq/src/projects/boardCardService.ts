/**
 * A task as a board, a sprint and the planning lists show it (spec "Decided on the designs", board cards): its key,
 * title and priority; its type (a mark before the key on a board that mixes types); its column's name; its agent,
 * whose avatar's ring is the execution state (D18); and whether it needs the person. In the project's rank order,
 * the order every board sorts by (D14). The rank itself is never sent: it is never shown.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import {
  isBoardColour, type AgentRef, type ExecutionState, type TaskState, type TaskTypeRef, type TypeColumnRef,
} from '@agenthix/core'
import { rowNeedsYou, type BoardTaskRow } from './boardViewRules'

export type BoardCard = {
  id: string
  number: number
  /** "WEB-14". */
  key: string
  title: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  type: TaskTypeRef | null
  column: TypeColumnRef | null
  state: TaskState
  executionState: ExecutionState
  agent: (AgentRef & { avatarUrl: string | null }) | null
  sprintId: string | null
  epicId: string | null
  needsYou: boolean
  /** An epic's progress on a board: how many of its tasks are done, of how many. */
  epicProgress?: { done: number; total: number }
}

export const CARD_SELECT = {
  id: true, number: true, title: true, priority: true, state: true, executionState: true, sprintId: true, epicId: true,
  typeId: true, columnId: true, assignedAgentId: true,
  type: { select: { id: true, name: true, icon: true, kind: true } },
  typeColumn: { select: { id: true, name: true, colour: true, state: true } },
  assignedAgent: { select: { id: true, name: true, handle: true, avatarUrl: true } },
  project: { select: { key: true } },
} satisfies Prisma.TaskSelect

export type CardRow = Prisma.TaskGetPayload<{ select: typeof CARD_SELECT }>

/** The project's rank, then the number for tasks of equal or no rank, so the order never shifts between reads. */
export const RANK_ORDER = [{ rank: { sort: 'asc', nulls: 'last' } }, { number: 'asc' }] satisfies Prisma.TaskOrderByWithRelationInput[]

export function boardRowOf(t: CardRow, optionId?: string | null): BoardTaskRow {
  return {
    id: t.id, typeId: t.typeId, typeKind: t.type?.kind ?? null, columnId: t.columnId, state: t.state,
    executionState: t.executionState, sprintId: t.sprintId, epicId: t.epicId, assignedAgentId: t.assignedAgentId,
    ...(optionId !== undefined ? { optionId } : {}),
  }
}

export function boardCard(t: CardRow): BoardCard {
  return {
    id: t.id, number: t.number, key: `${t.project.key}-${t.number}`, title: t.title, priority: t.priority,
    type: t.type, state: t.state, executionState: t.executionState, sprintId: t.sprintId, epicId: t.epicId,
    column: t.typeColumn ? { ...t.typeColumn, colour: isBoardColour(t.typeColumn.colour) ? t.typeColumn.colour : 'neutral' } : null,
    agent: t.assignedAgent,
    needsYou: rowNeedsYou({ executionState: t.executionState, state: t.state, typeKind: t.type?.kind ?? null }),
  }
}

/** The tasks `where` selects, as cards, in rank order. Archived tasks are left out unless `where` says otherwise. */
export async function readCards(where: Prisma.TaskWhereInput): Promise<CardRow[]> {
  return prisma.task.findMany({ where: { archived: false, ...where }, select: CARD_SELECT, orderBy: RANK_ORDER })
}

/** Each epic's progress: how many of its tasks (archived ones left out) are done, of how many. */
export async function epicProgressOf(epicIds: string[]): Promise<Map<string, { done: number; total: number }>> {
  if (epicIds.length === 0) return new Map()
  const rows = await prisma.task.groupBy({ by: ['epicId', 'state'], where: { epicId: { in: epicIds }, archived: false }, _count: { _all: true } })
  const progress = new Map(epicIds.map(id => [id, { done: 0, total: 0 }]))
  for (const r of rows) {
    const p = r.epicId ? progress.get(r.epicId) : undefined
    if (!p) continue
    p.total += r._count._all
    if (r.state === 'DONE') p.done += r._count._all
  }
  return progress
}
