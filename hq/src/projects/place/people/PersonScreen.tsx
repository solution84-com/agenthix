import { useState } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { useNavigate } from 'react-router'
import { useQuery, useAction, getProjectPerson, getProjectTeams, setProjectMemberRole } from 'wasp/client/operations'
import { ProjectPersonView, isLastAdmin, type ProjectPersonDetailData, type ProjectRoleData } from '@agenthix/ui/people'
import { personAvatarOf } from '../../../people/AuthedPersonAvatar'
import { PersonProfileTrigger } from '../../../people/PersonProfileCard'
import { orgPeoplePath } from '../../../people/orgPeoplePaths'
import { PEOPLE_REFRESH_MS, useProjectPeopleView } from './useProjectPeopleView'
import { reasonOf } from './peopleErrors'
import { usePeopleToolUrl } from './usePeopleToolUrl'

export function PersonScreen({ projectId, userId, onBack, onRemove, onLeave, backLabel = 'People' }: {
  projectId: string
  userId: string
  onBack: () => void
  onRemove: () => void
  onLeave: () => void
  backLabel?: string
}) {
  const navigate = useNavigate()
  const { openTool } = usePeopleToolUrl()
  const setRole = useAction(setProjectMemberRole)
  const [roleError, setRoleError] = useState('')
  const { data, isLoading, error, refetch } = useQuery(getProjectPerson, { projectId, userId }, { refetchInterval: PEOPLE_REFRESH_MS })
  const { view } = useProjectPeopleView(projectId)
  const { data: teamsData } = useQuery(getProjectTeams, { projectId })
  const detail = data as ProjectPersonDetailData | undefined
  if (isLoading) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (error || !detail) {
    return (
      <div className="space-y-2 px-4 py-6 text-small text-text-muted">
        <p>That person is not in this project.</p>
        <button type="button" onClick={onBack} className={`rounded text-link hover:underline ${FOCUS_RING}`}>‹ {backLabel}</button>
      </div>
    )
  }

  const everyone = view?.people ?? []
  const standing = teamsData?.people.find(p => p.userId === userId)
  const teamNames = (standing?.teamIds ?? []).map(id => teamsData?.teams.find(t => t.id === id)?.name).filter((n): n is string => !!n)
  const change = async (role: ProjectRoleData) => {
    setRoleError('')
    try {
      await setRole({ projectId, userId, role })
      await refetch()
    } catch (err) {
      setRoleError(reasonOf(err, 'Could not change the role'))
    }
  }

  return (
    <ProjectPersonView
      detail={detail}
      now={new Date()}
      lastAdmin={isLastAdmin(everyone, detail)}
      personal={view?.project.personal}
      renderAvatar={personAvatarOf}
      profileOf={(id, children) => <PersonProfileTrigger userId={id} projectId={projectId}>{children}</PersonProfileTrigger>}
      onBack={onBack}
      backLabel={backLabel}
      teams={standing && teamNames.length > 0 ? { names: teamNames, direct: standing.direct, ownRole: standing.ownRole } : undefined}
      onOpenTasks={() => openTool('tasks')}
      onOpenWaiting={taskKey => openTool('tasks', { task: taskKey, at: 'waiting' })}
      onSetRole={role => void change(role)}
      onManageInOrganisation={() => navigate(orgPeoplePath(userId))}
      onRemove={onRemove}
      onLeave={onLeave}
      roleError={roleError}
    />
  )
}
