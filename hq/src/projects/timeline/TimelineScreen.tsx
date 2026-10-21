import { Timeline, type TimelineScale } from '@agenthix/ui/timeline'
import { TaskInToolView } from '../pages/TaskInToolView'
import { TaskSessionPane } from '../pages/TaskSessionPane'
import { useTimelineScreen } from './useTimelineScreen'
import { useHiddenBoards } from './useHiddenBoards'
import { useTimelineTaskUrl } from './useTimelineTaskUrl'

/**
 * The timeline of a project or one board, with a task opening inside it (spec §3):
 * clicking a bar shows the task, as the Tasks tool does, and Back returns to the
 * timeline where it was.
 */
export function TimelineScreen({ projectId, boardId, initialScale }: {
  projectId: string
  /** Absent: the whole project, a lane per board. */
  boardId?: string
  initialScale: TimelineScale
}) {
  const screen = useTimelineScreen({ projectId, boardId, initialScale })
  const [hidden, toggleBoard] = useHiddenBoards(projectId)
  const { open, openTask, openSession, close } = useTimelineTaskUrl()

  if (open?.session) {
    return <TaskSessionPane key={open.taskKey} taskKey={open.taskKey} onBack={() => openTask(open.taskKey)} />
  }
  if (open) {
    return (
      <TaskInToolView
        key={open.taskKey} taskKey={open.taskKey} focusWaiting={false} backLabel="Timeline"
        onBack={close} onGone={close} onOpenSession={() => openSession(open.taskKey)}
      />
    )
  }
  return (
    <Timeline
      scale={screen.scale} show={screen.show} now={screen.now}
      onScale={screen.onScale} onShow={screen.onShow}
      data={screen.data} loading={screen.loading} notice={screen.notice}
      chooseBoards={!boardId} hiddenBoardIds={boardId ? undefined : hidden} onToggleBoard={toggleBoard}
      onOpenTask={task => openTask(task.key)}
      onChangePlan={screen.onChangePlan} onChangeStartTime={screen.onChangeStartTime}
    />
  )
}
