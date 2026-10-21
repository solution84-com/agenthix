import { ProjectLayout } from '../../shared/layouts/ProjectLayout'
import { TasksTool } from './TasksTool'

/**
 * The Tasks tool as a routed page: a project's former Tasks tab address, which opens the
 * project with the tool open, and the personal space's tool in Chat (`projectKey` names its project).
 */
export function ProjectTasksPage({ projectKey }: { projectKey?: string } = {}) {
  return (
    <ProjectLayout>
      <TasksTool projectKey={projectKey} />
    </ProjectLayout>
  )
}
