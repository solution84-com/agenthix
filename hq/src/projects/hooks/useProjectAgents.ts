import { useQuery, getAgents, getProject } from 'wasp/client/operations'
import { agentsForProjectPicker } from '../pages/projectRoster'

interface AgentRow {
  id: string
  name: string
  handle: string
}

/**
 * The agents a task in this project may be assigned to. Empty until the
 * project's roster has loaded, so a person is never offered an agent the server
 * would refuse in the meantime.
 */
export function useProjectAgents(projectId: string | undefined, currentAgentId?: string | null) {
  const { data: allAgents } = useQuery(getAgents)
  const { data: project } = useQuery(getProject, projectId ? { projectId } : undefined, { enabled: !!projectId })
  return agentsForProjectPicker<AgentRow>(allAgents ?? [], project, currentAgentId)
}
