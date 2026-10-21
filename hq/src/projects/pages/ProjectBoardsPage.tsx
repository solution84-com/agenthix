import { ProjectLayout } from '../../shared/layouts/ProjectLayout'
import { BoardsTool } from '../boards/BoardsTool'
import type { BoardTimelineRenderer } from '../boards/OpenedBoard'

/**
 * The Boards tool as a routed page: a project's former Boards tab address, which opens the project with the
 * tool open, and the personal space's tool in Chat (`projectKey` names its project).
 */
export function ProjectBoardsPage({ projectKey, renderTimeline }: { projectKey?: string; renderTimeline?: BoardTimelineRenderer } = {}) {
  return (
    <ProjectLayout>
      <BoardsTool projectKey={projectKey} renderTimeline={renderTimeline} />
    </ProjectLayout>
  )
}
