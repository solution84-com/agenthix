import { useEffect, useMemo } from 'react'
import {
  useQuery, useAction, getBoard, getBoardShowAlso, getProjectBoards, getBoardSprints, getSprintTasks,
  moveTaskToColumn, moveTaskToBoard, setBoardShowAlso, updateBoard, archiveBoard, unarchiveBoard, deleteBoard,
  renameSprint, finishSprint, createTask,
} from 'wasp/client/operations'
import { useSocket } from 'wasp/client/webSocket'
import type {
  BoardCardData, BoardColumnInfo, BoardListItem, PastSprint, ShowAlsoGroup, ShowAlsoOption, SprintInfo, UnfinishedDestination,
} from '@agenthix/ui/board'

const BOARD_REFRESH_MS = 15_000

/** One board as `getBoard` returns it, cast at the boundary to what the board components read. */
export interface OpenedBoardData {
  id: string
  name: string
  kind: 'PROJECT_TASKS' | 'WORKFLOW' | 'SPRINTS'
  archivedAt: string | Date | null
  templateId: string | null
  projectId: string
  project: { id: string; name: string; key: string }
  projectTasksBoardId: string
  columns: BoardColumnInfo[]
  tasks: BoardCardData[]
  backlog: BoardCardData[]
  showAlso: ShowAlsoGroup[]
  currentSprint: SprintInfo | null
  roundLine: import('@agenthix/ui/board').BoardRoundLine | null
}

/** Everything the opened board reads and every change it can make; each change reads the board again. */
export function useOpenedBoard(boardId: string, opts: { pastSprintsWanted: boolean; viewedSprintId: string | null }) {
  const { data, isLoading, error, refetch } = useQuery(getBoard, { boardId }, { refetchInterval: BOARD_REFRESH_MS })
  const board: OpenedBoardData | undefined = data
  const { data: alsoData, refetch: refetchAlso } = useQuery(getBoardShowAlso, { boardId })
  const { data: boardsData, refetch: refetchBoards } = useQuery(
    getProjectBoards, board ? { projectId: board.projectId, includeArchived: true } : undefined, { enabled: !!board },
  )
  const { data: sprintsData } = useQuery(getBoardSprints, { boardId }, { enabled: opts.pastSprintsWanted || !!opts.viewedSprintId })
  const { data: viewedTasks } = useQuery(getSprintTasks, opts.viewedSprintId ? { sprintId: opts.viewedSprintId } : undefined, { enabled: !!opts.viewedSprintId })

  const { socket } = useSocket()
  useEffect(() => {
    if (!socket) return
    const onUpdate = () => { void refetch() }
    socket.emit('subscribeToBoard', boardId as never)
    socket.on('taskUpdated', onUpdate as never)
    return () => { socket.off('taskUpdated', onUpdate as never) }
  }, [socket, boardId, refetch])

  const moveColumnFn = useAction(moveTaskToColumn)
  const moveBoardFn = useAction(moveTaskToBoard)
  const showAlsoFn = useAction(setBoardShowAlso)
  const updateFn = useAction(updateBoard)
  const archiveFn = useAction(archiveBoard)
  const unarchiveFn = useAction(unarchiveBoard)
  const deleteFn = useAction(deleteBoard)
  const renameFn = useAction(renameSprint)
  const finishFn = useAction(finishSprint)
  const createFn = useAction(createTask)

  const reload = async () => { await Promise.all([refetch(), refetchAlso(), refetchBoards()]) }
  const after = <A extends unknown[]>(fn: (...a: A) => Promise<unknown>) => async (...a: A) => { await fn(...a); await reload() }

  const sprints: PastSprint[] | undefined = sprintsData
  const others = useMemo(
    () => (boardsData ?? []).filter(b => b.id !== boardId && !b.archivedAt).map(b => ({ id: b.id, name: b.name })),
    [boardsData, boardId],
  )

  return {
    board, isLoading, error, reload,
    showAlso: alsoData as { boardIds: string[]; options: ShowAlsoOption[] } | undefined,
    otherBoards: others,
    sprints,
    viewedSprint: sprints?.find(s => s.id === opts.viewedSprintId) ?? null,
    viewedTasks: viewedTasks as unknown as BoardCardData[] | undefined,
    moveToColumn: after((taskId: string, column: string | null) => moveColumnFn({ taskId, column, boardId })),
    moveToBoard: after((taskId: string, toBoardId: string) => moveBoardFn({ taskId, boardId: toBoardId })),
    setShowAlso: after((boardIds: string[]) => showAlsoFn({ boardId, boardIds })),
    saveColumns: after((columns: BoardColumnInfo[]) => updateFn({ boardId, columns: columns as never })),
    archive: after(() => archiveFn({ boardId })),
    unarchive: after(() => unarchiveFn({ boardId })),
    remove: () => deleteFn({ boardId }),
    rename: after((sprintId: string, name: string | null) => renameFn({ sprintId, name })),
    finish: after((unfinished: UnfinishedDestination) => finishFn({ boardId, unfinished })),
    addTask: after((projectId: string, title: string) => createFn({ projectId, title, boardId })),
  }
}
