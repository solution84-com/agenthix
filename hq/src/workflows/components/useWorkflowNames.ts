import { useAuth } from 'wasp/client/auth'
import { useQuery, getAgents, getProjectMembers } from 'wasp/client/operations'
import type { WorkflowPlace } from '../pages/workflowTypes'

/** Who a version or a switch names, by id: the place's people and the agents. An id nobody knows is "someone". */
export function useWorkflowNames(place: WorkflowPlace) {
  const { data: me } = useAuth()
  const { data: members } = useQuery(getProjectMembers, place.type === 'project' ? { projectId: place.id } : undefined, { enabled: place.type === 'project' })
  const { data: agents } = useQuery(getAgents)
  const people = new Map((members ?? []).map((m) => [m.userId, m.username]))
  const agentNames = new Map((agents ?? []).map((a) => [a.id, a.name]))
  return {
    person: (id: string | null | undefined): string => (!id ? 'someone' : id === me?.id ? 'you' : (people.get(id) ?? 'someone')),
    agent: (id: string | null | undefined): string => (id && agentNames.get(id)) || 'an agent',
  }
}
