import { useParams } from 'react-router'
import { useQuery, getProjectByKey, getProjectBoards } from 'wasp/client/operations'
import { TaskInToolView } from '../pages/TaskInToolView'
import { TaskSessionPane } from '../pages/TaskSessionPane'
import { BoardsListScreen } from './BoardsListScreen'
import { NewBoardScreen } from './NewBoardScreen'
import { OpenedBoard, type BoardTimelineRenderer } from './OpenedBoard'
import { useBoardsToolUrl } from './useBoardsToolUrl'

/**
 * The Boards tool of a project or the personal space (every screen reviewed spec §3): the list of boards,
 * a board opening inside the tool, and a task opening from a board. `projectKey` names the project where the
 * address does not (Chat). `renderTimeline` is the Timeline tool's view of a board, for its Columns · Timeline switch.
 */
export function BoardsTool({ projectKey, renderTimeline }: { projectKey?: string; renderTimeline?: BoardTimelineRenderer } = {}) {
  const params = useParams<{ key: string }>()
  const key = projectKey ?? params.key
  const { data: projectData } = useQuery(getProjectByKey, key ? { key } : undefined)
  const projectId = projectData?.id
  const url = useBoardsToolUrl()
  const { screen } = url
  const { data: boards } = useQuery(getProjectBoards, projectId ? { projectId, includeArchived: true } : undefined, { enabled: !!projectId })
  if (!projectId) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>

  const nameOf = (boardId: string) => boards?.find(b => b.id === boardId)?.name ?? 'Board'

  switch (screen.kind) {
    case 'new':
      return <NewBoardScreen projectId={projectId} onBack={url.toList} onCreated={id => url.toBoard(id)} />
    case 'board':
      return (
        <OpenedBoard
          key={screen.boardId} boardId={screen.boardId} mode={screen.mode} sprintId={screen.sprintId}
          onBack={url.toList}
          onOpenTask={taskKey => url.toTask(screen.boardId, taskKey)}
          onMode={m => url.toBoard(screen.boardId, { mode: m ?? undefined, sprintId: null })}
          onViewSprint={sprintId => url.toBoard(screen.boardId, { sprintId })}
          onDeleted={url.toList}
          renderTimeline={renderTimeline}
        />
      )
    case 'task':
      return (
        <TaskInToolView
          key={screen.taskKey} taskKey={screen.taskKey} focusWaiting={screen.atWaiting} backLabel={nameOf(screen.boardId)}
          onBack={() => url.toBoard(screen.boardId)} onGone={() => url.toBoard(screen.boardId)}
          onOpenSession={() => url.toSession(screen.boardId, screen.taskKey)}
        />
      )
    case 'session':
      return <TaskSessionPane key={screen.taskKey} taskKey={screen.taskKey} onBack={() => url.toTask(screen.boardId, screen.taskKey)} />
    default:
      return (
        <BoardsListScreen
          projectId={projectId} archived={screen.kind === 'archived'}
          onOpen={id => url.toBoard(id)} onNew={url.toNew} onShowArchived={url.toArchived} onShowActive={url.toList}
        />
      )
  }
}
