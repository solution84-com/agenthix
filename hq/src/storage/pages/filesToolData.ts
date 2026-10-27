/** Everything the Files tools read, behind one module (every screen reviewed spec §3). */
import {
  useQuery, listLocationFiles, getMyStorage, listArtefacts, listKnowledgePages, listPlacePreviews,
} from 'wasp/client/operations'
import type { SiteSilence } from '@agenthix/core'
import type { ListedEntry } from '@agenthix/ui/projects'

export interface Owner {
  ownerType: 'project' | 'user'
  ownerId: string
}

/** A location the Files tools read: the place's own storage, or one workspace in it. */
export interface Target extends Owner {
  workspaceId?: string
}

export interface Read<T> {
  data: T | undefined
  isLoading: boolean
  error: Error | null
}

/** The entries directly under one folder of a location, with their size and time where the site gave them. */
export function useFolder(target: Target, subPath: string, enabled = true): Read<ListedEntry[]> {
  const { data, isLoading, error } = useQuery(listLocationFiles, { target, subPath: subPath || undefined }, { enabled })
  return { data: data?.entries as ListedEntry[] | undefined, isLoading, error }
}

export function useArtefacts(owner: Owner, enabled = true): Read<ListedEntry[]> {
  const { data, isLoading, error } = useQuery(listArtefacts, { ownerType: owner.ownerType, ownerId: owner.ownerId }, { enabled })
  return { data: data?.entries.map(e => ({ ...e, isDir: false })), isLoading, error }
}

/** The pages of a place's knowledge, for the count beside the tool's name; the tool itself reads the whole list. */
export function useKnowledge(owner: Owner, enabled = true): Read<unknown[]> {
  const { data, isLoading, error } = useQuery(listKnowledgePages, { owner }, { enabled })
  return { data: (data as { pages?: unknown[] } | undefined)?.pages, isLoading, error }
}

/** The running preview of each workspace in a place, by workspace id. */
export function usePlacePreviews(owner: Owner): Map<string, string> {
  const { data } = useQuery(listPlacePreviews, { ownerType: owner.ownerType, ownerId: owner.ownerId })
  const byWorkspace = new Map<string, string>()
  for (const p of data?.previews ?? []) if (p.workspaceId && !byWorkspace.has(p.workspaceId)) byWorkspace.set(p.workspaceId, p.id)
  return byWorkspace
}

/** Where a running preview opens, through hq's access check (`OpenPreviewPage`). */
export const previewAddress = (previewId: string) => `/open-preview/${previewId}`

export interface WorkspaceListItem {
  id: string
  name: string
  repoUrl: string | null
}

type StorageGroup = { key: string; workspaces: WorkspaceListItem[] }

/** The workspaces one owner holds, and the sites that could not be asked for theirs. */
export function useWorkspaces(owner: Owner): { workspaces: WorkspaceListItem[] | undefined; unanswered: SiteSilence[]; isLoading: boolean } {
  const { data, isLoading } = useQuery(getMyStorage)
  // Cast at the boundary, as the other readers of this query do: Wasp regenerates its inferred type only on a rebuild.
  const storage = data as { groups?: StorageGroup[]; unanswered?: SiteSilence[] } | undefined
  const group = storage?.groups?.find(g => g.key === `${owner.ownerType}:${owner.ownerId}`)
  return { workspaces: group?.workspaces, unanswered: storage?.unanswered ?? [], isLoading }
}
