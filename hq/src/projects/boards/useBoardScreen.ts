import { useEffect } from 'react'
import {
  useQuery, useAction, getBoardViews, getBoardView, getBoardChoices, dropOnBoard, saveBoardView, updateBoardView,
  runTask, stopTask, addTasksToSprint, removeTasksFromSprint,
} from 'wasp/client/operations'
import { useSocket } from 'wasp/client/webSocket'
import type { BoardListEntry } from '../boardListService'
import type { BoardRead } from '../boardViewService'
import type { BoardChoices } from '../boardChoices'
import { applyOverrides, BUILT_IN_SPECS, isChanged, type ViewOverrides, type ViewSpec } from './boardViewModel'
import type { BoardKey } from './useBoardsToolUrl'

/** How often an open board reads itself again, beside the socket's word that a task on it changed. */
const BOARD_REFRESH_MS = 15_000

/** The board a key names, before what the address changes: a built-in one, a new view (the task state), or a saved one. */
export function baseOf(key: BoardKey, boards: BoardListEntry[] | undefined): { spec: ViewSpec; saved: BoardListEntry | null } | null {
  if (key === 'state' || key === 'execution') return { spec: BUILT_IN_SPECS[key], saved: null }
  if (key === 'new') return { spec: BUILT_IN_SPECS.state, saved: null }
  const saved = boards?.find(b => b.id === key)
  if (!saved) return null
  return { spec: { kind: saved.kind, typeId: saved.typeId, fieldId: saved.fieldId, filter: saved.filter }, saved }
}

/**
 * One board as the screen reads it: the project's boards (for the switcher), what its menus choose from, the view shown
 * (what was saved, with what the address changes), and its columns and cards. A task on it changing anywhere reads it again.
 */
export function useBoardScreen({ projectId, board, overrides }: {
  projectId: string
  board: BoardKey
  overrides: ViewOverrides
}) {
  const boardsQuery = useQuery(getBoardViews, { projectId })
  const choicesQuery = useQuery(getBoardChoices, { projectId })
  const boards: BoardListEntry[] | undefined = boardsQuery.data
  const choices: BoardChoices | undefined = choicesQuery.data
  const base = baseOf(board, boards)
  const view = base ? applyOverrides(base.spec, overrides) : null
  const changed = !!base && !!view && isChanged(base.spec, view)
  const ref = !view ? undefined
    : base?.saved && !changed ? { boardId: base.saved.id! }
      : { projectId, kind: view.kind, typeId: view.typeId, fieldId: view.fieldId, filter: view.filter }
  const readQuery = useQuery(getBoardView, ref, { enabled: !!ref, refetchInterval: BOARD_REFRESH_MS })
  const read: BoardRead | undefined = readQuery.data
  const { refetch } = readQuery

  const { socket } = useSocket()
  // The project's own room says when any of its tasks changes, whichever board this is (boardNotify.ts).
  useEffect(() => {
    if (!socket) return
    const onUpdate = () => { void refetch() }
    socket.emit('subscribeToBoard', projectId as never)
    socket.on('taskUpdated', onUpdate as never)
    return () => { socket.off('taskUpdated', onUpdate as never) }
  }, [socket, projectId, refetch])

  const dropFn = useAction(dropOnBoard)
  const saveFn = useAction(saveBoardView)
  const updateFn = useAction(updateBoardView)
  const runFn = useAction(runTask)
  const stopFn = useAction(stopTask)
  const addToSprintFn = useAction(addTasksToSprint)
  const removeFromSprintFn = useAction(removeTasksFromSprint)

  const after = async <T,>(work: Promise<T>): Promise<T> => {
    const result = await work
    await Promise.all([refetch(), boardsQuery.refetch()])
    return result
  }

  return {
    boards, choices, base, view, changed, read,
    loading: boardsQuery.isLoading || (!!ref && readQuery.isLoading),
    error: readQuery.error ?? boardsQuery.error ?? null,
    /** What `useBackgroundRead` needs: the board's own read, and the switcher's failure counted with it. */
    background: { data: readQuery.data, error: readQuery.error ?? boardsQuery.error ?? null, dataUpdatedAt: readQuery.dataUpdatedAt, refetch: () => { void readQuery.refetch(); void boardsQuery.refetch() } },
    refetch,
    drop: (d: { taskId: string; column: string; afterTaskId: string | null; beforeTaskId: string | null }) =>
      after(dropFn({ ...ref!, ...d })),
    saveAsNew: (name: string) => after(saveFn({ projectId, name, kind: view!.kind, typeId: view!.typeId, fieldId: view!.fieldId, filter: view!.filter })),
    saveChanges: () => after(updateFn({ boardId: base!.saved!.id!, filter: view!.filter })),
    run: (taskId: string) => after(runFn({ taskId })),
    stop: (taskId: string) => after(stopFn({ taskId })),
    setSprint: (taskId: string, sprintId: string | null) =>
      after(sprintId ? addToSprintFn({ sprintId, taskIds: [taskId] }) : removeFromSprintFn({ projectId, taskIds: [taskId] })),
  }
}
