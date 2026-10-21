import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useAction, listPeopleForProject, addProjectMember } from 'wasp/client/operations'
import { useAuth } from 'wasp/client/auth'
import { AddPeopleView, type PickablePersonData, type ProjectRoleData } from '@agenthix/ui/people'
import { personAvatarOf } from '../../../people/AuthedPersonAvatar'
import { PersonProfileTrigger } from '../../../people/PersonProfileCard'
import { orgInvitePath } from '../../../people/orgPeoplePaths'
import { useIsAdmin } from '../../../shared/hooks/useIsAdmin'
import { useProjectPeopleView } from './useProjectPeopleView'
import { reasonOf } from './peopleErrors'

export function AddPeopleScreen({ projectId, onBack, backLabel = 'People' }: { projectId: string; onBack: () => void; backLabel?: string }) {
  const navigate = useNavigate()
  const { data: me } = useAuth()
  const { data, refetch } = useQuery(listPeopleForProject, { projectId })
  const add = useAction(addProjectMember)
  const { refetch: refetchPeople } = useProjectPeopleView(projectId)
  const [role, setRole] = useState<ProjectRoleData>('MEMBER')
  const [addingId, setAddingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const isAdmin = useIsAdmin()

  const people = (data ?? []) as PickablePersonData[]
  const pick = async (userId: string) => {
    setError('')
    setAddingId(userId)
    try {
      await add({ projectId, userId, role })
      await Promise.all([refetch(), refetchPeople()])
    } catch (err) {
      setError(reasonOf(err, 'Could not add that person'))
    } finally {
      setAddingId(null)
    }
  }

  return (
    <AddPeopleView
      people={people}
      meId={me?.id ?? ''}
      role={role}
      onRoleChange={setRole}
      renderAvatar={personAvatarOf}
      profileOf={(userId, children) => <PersonProfileTrigger userId={userId} projectId={projectId}>{children}</PersonProfileTrigger>}
      addingId={addingId}
      onAdd={userId => void pick(userId)}
      onBack={onBack}
      backLabel={backLabel}
      onInvite={isAdmin ? () => navigate(orgInvitePath()) : undefined}
      error={error}
    />
  )
}
