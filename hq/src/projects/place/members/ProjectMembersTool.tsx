import { ProjectPeopleTool } from '../ProjectPeopleTool'
import { ProjectAgentsTool } from '../ProjectAgentsTool'
import { usePeopleToolUrl } from '../people/usePeopleToolUrl'
import { useAgentsToolUrl } from '../../agents/useAgentsToolUrl'
import { AddTeamScreen } from './AddTeamScreen'
import { MembersListScreen } from './MembersListScreen'
import { RemoveTeamScreen } from './RemoveTeamScreen'
import { useMembersUrl } from './useMembersUrl'

/**
 * Members (every screen reviewed spec §3, Organisation): a project's teams, people and agents in one view, in place of
 * its People and Agents views. A person or an agent opens inside it, with their own screens; Add offers a person, an agent
 * or a team. Members decide entitlement, an agent's assignment grants it nothing (adr-0099), and a team writes through to both (adr-0103).
 */
export function ProjectMembersTool({ projectId }: { projectId: string }) {
  const people = usePeopleToolUrl()
  const agents = useAgentsToolUrl()
  const members = useMembersUrl()
  if (people.screen.kind !== 'list') return <ProjectPeopleTool projectId={projectId} backLabel="Members" />
  if (agents.screen.kind !== 'list') return <ProjectAgentsTool projectId={projectId} backLabel="Members" />
  switch (members.screen.kind) {
    case 'addTeam':
      return <AddTeamScreen projectId={projectId} onBack={members.toList} />
    case 'removeTeam':
      return <RemoveTeamScreen projectId={projectId} teamId={members.screen.teamId} onCancel={members.toList} onDone={members.toList} />
    default:
      return <MembersListScreen projectId={projectId} url={members} />
  }
}
