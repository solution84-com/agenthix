/**
 * What the task, board and sprint tools answer about a task, and how they read a task named by its key or its id.
 * A task is answered as the board cards draw it (boardCardService.ts): its key, type, column, task state, execution
 * state and agent, never its rank, which is only its place in the project's order.
 */
import { prisma } from 'wasp/server'
import { CARD_SELECT, type BoardCard, type CardRow } from '../../projects/boardCardService'
import { ControlPlaneError } from './types'
import { taskIdFor } from './taskKey'

export type ToolTask = {
  taskId: string
  key: string
  title: string
  type: string | null
  column: string | null
  columnId: string | null
  state: string
  executionState: string
  priority: string
  agent: { id: string; name: string } | null
  sprintId: string | null
  epicId: string | null
}

export function toolTask(t: CardRow): ToolTask {
  return {
    taskId: t.id, key: `${t.project.key}-${t.number}`, title: t.title,
    type: t.type?.name ?? null, column: t.typeColumn?.name ?? null, columnId: t.columnId,
    state: t.state, executionState: t.executionState, priority: t.priority,
    agent: t.assignedAgent ? { id: t.assignedAgent.id, name: t.assignedAgent.name } : null,
    sprintId: t.sprintId, epicId: t.epicId,
  }
}

/** A board's card, as the tools answer it. */
export function toolTaskOfCard(c: BoardCard): ToolTask {
  return {
    taskId: c.id, key: c.key, title: c.title, type: c.type?.name ?? null, column: c.column?.name ?? null,
    columnId: c.column?.id ?? null, state: c.state, executionState: c.executionState, priority: c.priority,
    agent: c.agent ? { id: c.agent.id, name: c.agent.name } : null, sprintId: c.sprintId, epicId: c.epicId,
  }
}

export async function readToolTask(taskId: string): Promise<ToolTask> {
  const row = await prisma.task.findUnique({ where: { id: taskId }, select: CARD_SELECT })
  if (!row) throw new ControlPlaneError('not_found', `Task ${taskId} not found`)
  return toolTask(row)
}

/** The id of a task named by its key or id, or the refusal saying it names none. */
export async function taskIdOf(words: string): Promise<string> {
  const found = await taskIdFor(words)
  if ('refusal' in found) throw new ControlPlaneError('not_found', found.refusal)
  return found.taskId
}

/** As taskIdOf, passing undefined and null through: left out, or cleared. */
export async function optionalTaskIdOf(words: string | null | undefined): Promise<string | null | undefined> {
  if (words === undefined || words === null) return words
  return taskIdOf(words)
}
