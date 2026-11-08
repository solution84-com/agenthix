import { useMemo } from 'react'
import { useAction, useQuery, getTaskTypes, getTasks, moveTask } from 'wasp/client/operations'
import type { TaskState, TaskTypeView } from '@agenthix/core'
import { columnChoices, columnOf, orderNeighbours, typeChoices, type PlaceChoice } from './taskPlace'

/** What a task's place is read from. */
export interface PlacedTask {
  id: string
  projectId: string
  typeId?: string | null
  columnId?: string | null
  state?: TaskState | null
  isEpic?: boolean
  epicId?: string | null
  runCount?: number
  assignedAgent?: { name: string } | null
}

export interface TaskPlace {
  types: TaskTypeView[]
  type: TaskTypeView | null
  column: { id: string; name: string } | null
  typeChoices: PlaceChoice[]
  columnChoices: PlaceChoice[]
  /** Each answers whether it worked, so a failure can open the centred dialog. */
  setType: (typeId: string) => Promise<unknown>
  setColumn: (columnId: string) => Promise<unknown>
  /** Absent where the task is already first, or last. */
  moveToTop?: () => Promise<unknown>
  moveToBottom?: () => Promise<unknown>
}

/**
 * The task's type and column (D10), from its project's types, and its place in the project's one order (D14): the
 * header's chips, Details' Plan, and ⋯'s Move to top and Move to bottom all change it through `moveTask`.
 */
export function useTaskPlace(task: PlacedTask | null | undefined): TaskPlace {
  const projectId = task?.projectId
  const { data: typeRows } = useQuery(getTaskTypes, projectId ? { projectId } : undefined, { enabled: !!projectId })
  const { data: taskRows } = useQuery(getTasks, projectId ? { projectId } : undefined, { enabled: !!projectId })
  const moveFn = useAction(moveTask)
  const types = useMemo(() => (typeRows ?? []) as TaskTypeView[], [typeRows])
  const rows = (taskRows ?? []) as Array<{ id: string; number: number; rank?: string | null; epicId?: string | null }>

  const type = types.find(t => t.id === task?.typeId) ?? null
  const column = columnOf(type, task?.columnId)
  const taskId = task?.id ?? ''
  const order = task ? orderNeighbours(rows, task.id) : { top: null, bottom: null }
  return {
    types,
    type,
    column: column ? { id: column.id, name: column.name } : null,
    typeChoices: task ? typeChoices(types, {
      typeId: task.typeId ?? null, state: task.state ?? 'BACKLOG', isEpic: !!task.isEpic, hasRuns: (task.runCount ?? 0) > 0,
      inAnEpic: !!task.epicId, hasEpicTasks: !!task.isEpic && rows.some(r => r.epicId === task.id),
      agentName: task.assignedAgent?.name ?? null,
    }) : [],
    columnChoices: columnChoices(type, task?.columnId ?? null),
    setType: typeId => moveFn({ taskId, typeId }),
    setColumn: columnId => moveFn({ taskId, columnId }),
    moveToTop: order.top ? () => moveFn({ taskId, beforeTaskId: order.top! }) : undefined,
    moveToBottom: order.bottom ? () => moveFn({ taskId, afterTaskId: order.bottom! }) : undefined,
  }
}
