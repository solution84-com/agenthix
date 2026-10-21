import { useQuery, getProjectPeople } from 'wasp/client/operations'
import type { ProjectPersonRowData } from '@agenthix/ui/people'

export const PEOPLE_REFRESH_MS = 15_000

export type PeopleView = {
  project: { id: string; key: string; name: string; accessLevel: 'OPEN' | 'PRIVATE'; personal: boolean }
  canManage: boolean
  people: ProjectPersonRowData[]
}

export function useProjectPeopleView(projectId: string) {
  const q = useQuery(getProjectPeople, { projectId }, { refetchInterval: PEOPLE_REFRESH_MS })
  return { ...q, view: q.data as PeopleView | undefined }
}
