import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, getProjectPreview, getTasks } from 'wasp/client/operations'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { ProjectOverviewView, type ProjectPreviewData } from '@agenthix/ui/people'
import { personAvatarOf } from '../../people/AuthedPersonAvatar'
import { PersonProfileTrigger } from '../../people/PersonProfileCard'
import { AgentProfileTrigger } from '../../agents/profile/AgentProfileCard'
import { avatarOf } from '../agents/avatarOf'
import { useMayWork } from '../../shared/hooks/useMayWork'
import { toToolTask, type TaskRowData } from '../pages/toolTaskRows'
import { useNow } from '../pages/useNow'
import { overviewWork } from './overviewWork'
import { isEpicTask } from '../components/taskKind'
import { ProjectWork } from './ProjectWork'

const REFRESH_MS = 15_000

/**
 * A project's Overview for a person in it (P4): its work, then who leads it, who is in it and which agents work there.
 * Each card that has nothing links to the tool that adds it; the tool tiles of the left menu are not repeated.
 */
export function ProjectOverview({ project, isProjectAdmin }: { project: { id: string; key: string; name: string }; isProjectAdmin: boolean }) {
  const navigate = useNavigate()
  const now = useNow()
  const mayWork = useMayWork(project.id)
  const live = { refetchInterval: REFRESH_MS }
  const query = useQuery(getProjectPreview, { projectId: project.id }, live)
  const { data } = query
  const read = useBackgroundRead(query, { what: 'The project', pollMs: REFRESH_MS })
  const { data: rows } = useQuery(getTasks, { projectId: project.id }, live)
  const work = useMemo(
    () => overviewWork((rows ?? []).filter(r => !isEpicTask(r as unknown as { type?: { kind: string } | null })).map(r => toToolTask(r as unknown as TaskRowData, project)), now),
    [rows, project, now],
  )
  if (!data) return read.failedWithoutData ? read.nudge : <p className="px-4 py-6 text-small text-text-muted">Loading…</p>

  const go = (tool: string) => () => navigate(`/projects/${project.key}?tool=${tool}`)
  return (
    <ProjectOverviewView
      preview={data as unknown as ProjectPreviewData}
      now={now}
      renderPersonAvatar={personAvatarOf}
      renderAgentAvatar={avatarOf}
      profileOf={(userId, children) => <PersonProfileTrigger userId={userId}>{children}</PersonProfileTrigger>}
      agentProfileOf={(agentId, children) => <AgentProfileTrigger agentId={agentId}>{children}</AgentProfileTrigger>}
      joining={false}
      onJoin={() => {}}
      work={<ProjectWork work={work} projectKey={project.key} />}
      actions={{
        newTask: mayWork ? go('tasks') : undefined,
        openMembers: go('members'),
        ...(isProjectAdmin ? { chooseLead: go('settings'), addPeople: go('members'), assignAgent: go('members'), addDescription: go('settings') } : {}),
      }}
    />
  )
}
