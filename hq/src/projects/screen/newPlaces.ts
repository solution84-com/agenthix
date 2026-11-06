import type { WorkspacesAcrossPlaces } from '../../storage/workspacesAcrossPlaces'
import type { NewPlace } from './NewIntoPlace'
import { CHAT_PLACE } from './acrossListUrl'

/** The fields of a `getProjects` row the *New board* and *New routine* place pickers read. */
export interface PlaceProject {
  id: string
  key: string
  name: string
  executionSiteId: string | null
  personalSpace?: boolean
  isMember: boolean
  myRole: 'ADMIN' | 'MEMBER' | 'VIEWER' | null
}

export interface PlaceSite { id: string; label: string; status: string; isDefault: boolean }

/** Where a board or routine may be added: the projects the person works in, their own Chat among them (a Viewer adds nothing). */
export function boardPlaces(projects: PlaceProject[]): NewPlace[] {
  return projects.filter(p => p.isMember && p.myRole !== 'VIEWER').map(p => p.personalSpace
    ? { id: p.id, value: CHAT_PLACE, name: 'Chat', key: null, siteLabel: null }
    : { id: p.id, value: p.key, name: p.name, key: p.key, siteLabel: null })
}

/** Where a workspace may be added, each with the site it would be on. */
export function workspacePlaces(across: WorkspacesAcrossPlaces | undefined, projects: PlaceProject[], sites: PlaceSite[]): NewPlace[] {
  const labelOf = (id: string | null | undefined) => sites.find(s => s.id === id)?.label ?? null
  const defaultLabel = sites.find(s => s.isDefault && s.status !== 'REVOKED')?.label ?? null
  return (across?.places ?? []).filter(p => p.mayAdd).map(p => ({
    id: p.ownerId,
    value: p.key ?? CHAT_PLACE,
    name: p.name,
    key: p.key,
    siteLabel: p.key ? labelOf(projects.find(pr => pr.id === p.ownerId)?.executionSiteId) : defaultLabel,
  }))
}
