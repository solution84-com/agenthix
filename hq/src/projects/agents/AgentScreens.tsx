import { useNavigate } from 'react-router'
import {
  useQuery, useAction, getProjectAgent, getProjectAgents, getProjectTeams, getPlaceInstructions, getAgents,
  createTask, removeAgentFromProject, addAgentToProject,
} from 'wasp/client/operations'
import {
  ProjectAgentView, ProjectAgentRemove, ProjectAgentAssign,
  type ProjectAgentDetailData, type ProjectAgentRowData, type PlaceInstructionsData,
} from '@agenthix/ui/agents'
import { useMayWork } from '../../shared/hooks/useMayWork'
import { AgentProfileTrigger } from '../../agents/profile/AgentProfileCard'
import { AgentPermissionsHere } from '../../agents/pages/AgentPermissionsHere'
import { avatarOf } from './avatarOf'
import { filesAddress, useOpenTool } from './useAgentsToolUrl'
import { newConversationPath } from '../../conversations/threadPaths'

const REFRESH_MS = 15_000

function Missing({ onBack, backLabel = 'Agents' }: { onBack: () => void; backLabel?: string }) {
  return (
    <div className="space-y-2 px-4 py-6 text-small text-text-muted">
      <p>That agent is not in this project.</p>
      <button type="button" onClick={onBack} className="text-accent hover:underline">‹ {backLabel}</button>
    </div>
  )
}

function useAgentDetail(projectId: string, agentId: string) {
  const q = useQuery(getProjectAgent, { projectId, agentId }, { refetchInterval: REFRESH_MS })
  return { ...q, detail: q.data as ProjectAgentDetailData | undefined }
}

export function AgentScreen({ projectId, agentId, focus, onBack, onRemove, backLabel }: {
  projectId: string
  agentId: string
  focus?: string | null
  onBack: () => void
  onRemove: () => void
  backLabel?: string
}) {
  const navigate = useNavigate()
  const openTool = useOpenTool()
  const canStart = useMayWork(projectId)
  const canChange = canStart
  const addTask = useAction(createTask)
  const { detail, isLoading, error } = useAgentDetail(projectId, agentId)
  const { data: instructions } = useQuery(getPlaceInstructions, { projectId, agentId })
  const { data: teamsData } = useQuery(getProjectTeams, { projectId })
  if (isLoading) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (error || !detail) return <Missing onBack={onBack} backLabel={backLabel} />
  const projectKey = (detail as unknown as { project: { key: string } }).project.key
  const standing = teamsData?.agents.find(a => a.agentId === agentId)
  const teamNames = (standing?.teamIds ?? []).map(id => teamsData?.teams.find(t => t.id === id)?.name).filter((n): n is string => !!n)

  return (
    <ProjectAgentView
      detail={detail}
      instructions={(instructions as PlaceInstructionsData | undefined) ?? null}
      now={new Date()}
      renderAvatar={avatarOf}
      profileOf={(id, children) => <AgentProfileTrigger agentId={id}>{children}</AgentProfileTrigger>}
      onStartConversation={canStart ? () => navigate(newConversationPath(`/projects/${projectKey}`, agentId)) : undefined}
      onAddTask={canChange ? async title => { await addTask({ projectId, title, assignedAgentId: agentId }) } : undefined}
      onMoreTaskDetails={() => openTool('tasks')}
      onBack={onBack}
      backLabel={backLabel}
      onlyThroughTeams={teamNames.length > 0 && standing && !standing.direct ? teamNames : undefined}
      onOpenTasks={() => openTool('tasks')}
      onOpenRuns={() => openTool('runs')}
      onOpenPlace={() => navigate(`/agents/${detail.agent.handle}`)}
      onOpenFile={path => openTool('files', filesAddress(path))}
      focus={focus}
      permissionsHere={(
        <AgentPermissionsHere
          agentId={agentId} agentName={detail.agent.name} boundaryType="project" boundaryId={projectId}
          title="Permissions here" readOnlyNote="Every member sees these; only this project's admins can change them."
        />
      )}
      onRemove={onRemove}
    />
  )
}

export function RemoveScreen({ projectId, agentId, onCancel, onRemoved }: {
  projectId: string
  agentId: string
  onCancel: () => void
  onRemoved: () => void
}) {
  const remove = useAction(removeAgentFromProject)
  const { detail, isLoading } = useAgentDetail(projectId, agentId)
  const { data } = useQuery(getProjectAgents, { projectId })
  if (isLoading) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (!detail || !detail.canManage) return <Missing onBack={onCancel} />
  const others = ((data as { agents: ProjectAgentRowData[] } | undefined)?.agents ?? []).filter(r => r.agent.id !== agentId)
  return (
    <ProjectAgentRemove
      agentName={detail.agent.name}
      openTasks={detail.tasks.total - detail.tasks.done}
      doneTasks={detail.tasks.done}
      isDefault={detail.isDefault}
      otherAgents={others.map(r => ({ id: r.agent.id, name: r.agent.name }))}
      onRemove={async (openTasksTo, newDefaultAgentId) => {
        await remove({ projectId, agentId, openTasksTo, ...(newDefaultAgentId !== undefined ? { newDefaultAgentId } : {}) })
        onRemoved()
      }}
      onCancel={onCancel}
    />
  )
}

export function AssignScreen({ projectId, onBack, backLabel }: { projectId: string; onBack: () => void; backLabel?: string }) {
  const add = useAction(addAgentToProject)
  const { data: all = [] } = useQuery(getAgents)
  const { data } = useQuery(getProjectAgents, { projectId })
  const here = new Set(((data as { agents: ProjectAgentRowData[] } | undefined)?.agents ?? []).map(r => r.agent.id))
  return (
    <ProjectAgentAssign
      candidates={all.filter(a => !here.has(a.id))}
      alreadyHere={all.filter(a => here.has(a.id)).map(a => a.name)}
      renderAvatar={avatarOf}
      onAssign={async agentId => { await add({ projectId, agentId }) }}
      onBack={onBack}
      backLabel={backLabel}
    />
  )
}
