import type { ProjectAgent } from '@agenthix/ui/projects'
import { AgentScreen, AssignScreen, EditScreen, RemoveScreen } from '../agents/AgentScreens'
import { useAgentsToolUrl } from '../agents/useAgentsToolUrl'

/**
 * An agent inside a project's Members (every screen reviewed spec §3): as it works in the project, with Assign, Edit and
 * Remove in place. The list of members is `members/MembersListScreen`; `agents` is only the place's count.
 */
export function ProjectAgentsTool({ projectId, backLabel }: { projectId: string; agents?: ProjectAgent[]; personal?: boolean; backLabel?: string }) {
  const url = useAgentsToolUrl()
  const { screen, focus } = url
  switch (screen.kind) {
    case 'assign':
      return <AssignScreen projectId={projectId} onBack={url.toList} backLabel={backLabel} />
    case 'agent':
      return (
        <AgentScreen
          key={screen.agentId} projectId={projectId} agentId={screen.agentId} focus={focus} backLabel={backLabel}
          onBack={url.toList} onEdit={() => url.toEdit(screen.agentId)} onRemove={() => url.toRemove(screen.agentId)}
        />
      )
    case 'edit':
      return <EditScreen projectId={projectId} agentId={screen.agentId} onDone={() => url.toAgent(screen.agentId)} />
    case 'remove':
      return <RemoveScreen projectId={projectId} agentId={screen.agentId} onCancel={() => url.toAgent(screen.agentId)} onRemoved={url.toList} />
    default:
      return null
  }
}
