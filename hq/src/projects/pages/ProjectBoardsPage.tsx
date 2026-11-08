import { ProjectLayout } from '../../shared/layouts/ProjectLayout'
import { BoardsTool } from '../boards/BoardsTool'

/**
 * The Boards tool as a routed page: a project's former Boards tab address, which opens the project with the tool
 * open, and the personal space's tool in Chat (`projectKey` names its project).
 */
export function ProjectBoardsPage({ projectKey }: { projectKey?: string } = {}) {
  return (
    <ProjectLayout>
      <BoardsTool projectKey={projectKey} />
    </ProjectLayout>
  )
}
