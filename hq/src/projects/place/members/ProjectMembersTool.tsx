import { ProjectPeopleTool } from '../ProjectPeopleTool'
import { ProjectAgentsTool } from '../ProjectAgentsTool'
import { usePeopleToolUrl } from '../people/usePeopleToolUrl'
import { useAgentsToolUrl } from '../../agents/useAgentsToolUrl'
import { MembersListScreen } from './MembersListScreen'
import { RemoveTeamScreen } from './RemoveTeamScreen'
import { useMembersUrl } from './useMembersUrl'

/**
 * Members: a project's people, agents and teams in one list, in place of its People and Agents views. A person or an
 * agent opens inside it, with their own screens; Add members is one dialog over the list. Members decide entitlement,
 * an agent's assignment grants it nothing (adr-0099), and a team writes through to both (adr-0103).
 */
export function ProjectMembersTool({ projectId }: { projectId: string }) {
  const people = usePeopleToolUrl()
  const agents = useAgentsToolUrl()
  const members = useMembersUrl()
  const { screen } = members
  if (screen.kind === 'removeTeam') {
    return <RemoveTeamScreen projectId={projectId} teamId={screen.teamId} onCancel={members.toList} onDone={members.toList} />
  }
  // The add screens' older addresses open the dialog over the list instead.
  if (screen.adding === null && people.screen.kind !== 'list') return <ProjectPeopleTool projectId={projectId} backLabel="Members" />
  if (screen.adding === null && agents.screen.kind !== 'list') return <ProjectAgentsTool projectId={projectId} backLabel="Members" />
  return <MembersListScreen projectId={projectId} url={members} />
}
