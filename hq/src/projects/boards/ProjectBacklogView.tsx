import { useMemo, useState } from 'react'
import {
  useQuery, useAction, getProjectBoards, getBoard, getBoardShowAlso, moveTaskToColumn, moveTaskToBoard, setBoardShowAlso,
} from 'wasp/client/operations'
import { BoardColumnsView,  type BoardCardData, type BoardListItem, type ShowAlsoGroup, type ShowAlsoOption } from '@agenthix/ui/board'
import { useMayWork } from '../../shared/hooks/useMayWork'
import type { OpenedBoardData } from './useOpenedBoard'
import { cardMenuItems } from './cardMenu'

const matches = (c: BoardCardData, q: string) => !q || c.title.toLowerCase().includes(q) || c.taskKey.toLowerCase().includes(q)

/** The id of the project's Project Tasks, and how many tasks wait in its Backlog. */
export function useProjectTasksBoard(projectId: string | undefined) {
  const { data } = useQuery(getProjectBoards, projectId ? { projectId } : undefined, { enabled: !!projectId })
  const boards: BoardListItem[] = data ?? []
  const projectTasks = boards.find(b => b.kind === 'PROJECT_TASKS')
  return { projectTasks, boards }
}

/**
 * Tasks › Backlog (every screen reviewed spec §3): Project Tasks' Backlog, by priority, with Show also to add
 * other boards' backlogs under their own headings. Each task can move to another board.
 */
export function ProjectBacklogView({ projectId, search, onOpen }: { projectId: string; search: string; onOpen: (taskKey: string) => void }) {
  const { projectTasks, boards } = useProjectTasksBoard(projectId)
  const boardId = projectTasks?.id
  const { data, refetch } = useQuery(getBoard, boardId ? { boardId } : undefined, { enabled: !!boardId })
  const { data: alsoData, refetch: refetchAlso } = useQuery(getBoardShowAlso, boardId ? { boardId } : undefined, { enabled: !!boardId })
  const moveColumnFn = useAction(moveTaskToColumn)
  const moveBoardFn = useAction(moveTaskToBoard)
  const showAlsoFn = useAction(setBoardShowAlso)
  const canChange = useMayWork(projectId)
  const [notice, setNotice] = useState('')
  const [now] = useState(() => new Date())
  const board: OpenedBoardData | undefined = data
  const also = alsoData as { boardIds: string[]; options: ShowAlsoOption[] } | undefined

  const q = search.trim().toLowerCase()
  const backlog = useMemo(() => (board?.backlog ?? []).filter(c => matches(c, q)), [board?.backlog, q])
  const groups: ShowAlsoGroup[] = useMemo(
    () => (board?.showAlso ?? []).map(g => ({ ...g, tasks: g.tasks.filter(c => matches(c, q)) })),
    [board?.showAlso, q],
  )
  if (!board || !boardId) return <p className="px-4 py-4 text-small text-text-muted">Loading…</p>

  const attempt = async (what: () => Promise<unknown>) => {
    setNotice('')
    try { await what(); await Promise.all([refetch(), refetchAlso()]) } catch (e) { setNotice(e instanceof Error ? e.message : 'That did not work') }
  }
  const ctx = {
    boardId, columns: board.columns, canChange,
    otherBoards: boards.filter(b => b.id !== boardId && !b.archivedAt).map(b => ({ id: b.id, name: b.name })),
    moveToColumn: (c: BoardCardData, column: string | null) => attempt(() => moveColumnFn({ taskId: c.id, column, boardId })),
    moveToBoard: (c: BoardCardData, to: string) => attempt(() => moveBoardFn({ taskId: c.id, boardId: to })),
  }
  return (
    <div>
      {notice && <p role="status" className="px-4 pt-2 text-small text-text-secondary">{notice}</p>}
      <div className="pt-3">
        <BoardColumnsView
          layout="stacked" boardId={boardId} columns={[]} cards={[]} backlog={backlog} showAlso={groups} now={now}
          showAlsoPicker={also ? { boardName: board.name, options: also.options, chosen: also.boardIds, onChange: ids => void attempt(() => showAlsoFn({ boardId, boardIds: ids })) } : undefined}
          onOpen={c => onOpen(c.taskKey)}
          menuFor={(c, from) => cardMenuItems(c, from, ctx)}
        />
      </div>
      <p className="px-4 py-3 text-small text-text-muted">Or ask in the conversation: "plan the backlog into Sprint 4".</p>
    </div>
  )
}
