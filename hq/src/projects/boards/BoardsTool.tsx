import { useParams } from 'react-router'
import { useQuery, getProjectByKey } from 'wasp/client/operations'
import { TaskInToolView } from '../pages/TaskInToolView'
import { TaskSessionPane } from '../pages/TaskSessionPane'
import { BoardsListScreen } from './BoardsListScreen'
import { BoardScreen, type BoardScreenProject } from './BoardScreen'
import { useBoardsToolUrl } from './useBoardsToolUrl'

/**
 * The Boards tool of a project or the personal space (adr-0176): the list of boards, a board opening inside the tool,
 * and a task opening from a board, with the board kept behind it so its scroll is kept. `projectKey` names the project
 * where the address does not (Chat).
 */
export function BoardsTool({ projectKey }: { projectKey?: string } = {}) {
  const params = useParams<{ key: string }>()
  const key = projectKey ?? params.key
  const { data } = useQuery(getProjectByKey, key ? { key } : undefined)
  const project: BoardScreenProject | undefined = data
  const url = useBoardsToolUrl()
  const { screen } = url
  if (!project) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (screen.kind === 'list') return <BoardsListScreen projectId={project.id} onOpen={(board, overrides) => url.toBoard(board, overrides)} />

  const back = () => url.toBoard(screen.board, screen.overrides)
  return (
    <>
      <BoardScreen
        key={screen.board} project={project} board={screen.board} overrides={screen.overrides} hidden={screen.kind !== 'board'}
        onBack={url.toList} onBoard={(board, overrides) => url.toBoard(board, overrides)}
        onView={overrides => url.toBoard(screen.board, overrides)}
        onOpenTask={taskKey => url.toTask(screen.board, screen.overrides, taskKey)}
      />
      {screen.kind === 'task' && (
        <TaskInToolView
          key={screen.taskKey} taskKey={screen.taskKey} focusWaiting={false} backLabel="Board" onBack={back} onGone={back}
          onOpenSession={() => url.toSession(screen.board, screen.overrides, screen.taskKey)}
        />
      )}
      {screen.kind === 'session' && (
        <TaskSessionPane key={screen.taskKey} taskKey={screen.taskKey} onBack={() => url.toTask(screen.board, screen.overrides, screen.taskKey)} />
      )}
    </>
  )
}
