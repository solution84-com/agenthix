import { useState } from 'react'
import { useAction, addTasksToSprint, moveTask, removeTasksFromSprint } from 'wasp/client/operations'
import { refusalText } from '../../shared/refusal'
import { moved, placeAt, stepIndex, type OrderPlace } from './planRules'
import type { SprintCard } from './SprintTaskBits'

export type Lists = { left: SprintCard[]; sprint: SprintCard[] }
export type Side = 'left' | 'sprint'

/** A move that did not save: which task, where it is back, and why (the design's key 13). */
export type FailedMove = { task: SprintCard; back: Side; why: string; retry: () => void }

/**
 * Plan Sprint's moves, each saved as it is made (the design's key 12: there is nothing to save or cancel): into the
 * sprint, out of it, and up or down either list. While one saves, the lists show it moved; if it fails, the lists are
 * read again, so the row is back where it was, and `failed` says so.
 */
export function usePlanMoves({ sprintId, projectId, lists, reload }: {
  sprintId: string
  projectId: string
  lists: Lists
  /** Reads both lists again; resolves once they are read. */
  reload: () => Promise<unknown>
}) {
  const add = useAction(addTasksToSprint)
  const remove = useAction(removeTasksFromSprint)
  const order = useAction(moveTask)
  const [shown, setShown] = useState<Lists | null>(null)
  const [failed, setFailed] = useState<FailedMove | null>(null)
  const now = shown ?? lists

  const save = (task: SprintCard, back: Side, next: Lists, work: () => Promise<unknown>) => {
    setShown(next)
    const retry = () => save(task, back, next, work)
    work().then(
      () => reload().finally(() => setShown(null)),
      err => { void reload().finally(() => setShown(null)); setFailed({ task, back, why: refusalText(err), retry }) },
    )
  }

  /** Moves `taskId` to `index` of the list `to` (counted without it). */
  const moveTo = (taskId: string, to: Side, index: number) => {
    const fromLeft = now.left.find(t => t.id === taskId)
    const task = fromLeft ?? now.sprint.find(t => t.id === taskId)
    if (!task) return
    const from: Side = fromLeft ? 'left' : 'sprint'
    const target = now[to]
    const place: OrderPlace = placeAt(target, taskId, index)
    if (from === to && target.findIndex(t => t.id === taskId) === index) return
    const next: Lists = from === to
      ? { ...now, [to]: moved(target, task, index) }
      : { left: to === 'left' ? moved(now.left, task, index) : now.left.filter(t => t.id !== taskId), sprint: to === 'sprint' ? moved(now.sprint, task, index) : now.sprint.filter(t => t.id !== taskId) }
    if (to === 'sprint') save(task, from, next, () => add({ sprintId, taskIds: [taskId], ...place }))
    else if (from === 'sprint') save(task, from, next, () => remove({ projectId, taskIds: [taskId] }))
    else save(task, from, next, () => order({ taskId, ...place }))
  }

  /** Moves a row one place up or down its own list, among the rows shown. */
  const step = (taskId: string, side: Side, visible: SprintCard[], by: -1 | 1) => {
    const index = stepIndex(now[side], visible, taskId, by)
    if (index !== null) moveTo(taskId, side, index)
  }

  return { lists: now, moveTo, step, failed, dismiss: () => setFailed(null) }
}
