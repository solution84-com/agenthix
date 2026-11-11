/** Everything the Files tools read, behind one module (every screen reviewed spec §3). */
import {
  useQuery, listLocationFiles, getMyStorage, listArtefacts, listKnowledgePages,
} from 'wasp/client/operations'
import type { SiteSilence } from '@agenthix/core'
import type { ListedEntry } from '@agenthix/ui/projects'
import { siteReadRetry } from '../../shared/siteRead'

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
  /** When the data on screen was read, for `useBackgroundRead`. */
  dataUpdatedAt: number
  refetch: () => unknown
}

/** The entries directly under one folder of a location, with their size and time where the site gave them. */
export function useFolder(target: Target, subPath: string, enabled = true): Read<ListedEntry[]> {
  const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery(listLocationFiles, { target, subPath: subPath || undefined }, { enabled, retry: siteReadRetry })
  return { data: data?.entries as ListedEntry[] | undefined, isLoading, error, dataUpdatedAt, refetch }
}

export function useArtefacts(owner: Owner, enabled = true): Read<ListedEntry[]> {
  const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery(listArtefacts, { ownerType: owner.ownerType, ownerId: owner.ownerId }, { enabled, retry: siteReadRetry })
  return { data: data?.entries.map(e => ({ ...e, isDir: false })), isLoading, error, dataUpdatedAt, refetch }
}

/** The pages of a place's knowledge, for the count beside the tool's name; the tool itself reads the whole list. */
export function useKnowledge(owner: Owner, enabled = true): Read<unknown[]> {
  const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery(listKnowledgePages, { owner }, { enabled, retry: siteReadRetry })
  return { data: (data as { pages?: unknown[] } | undefined)?.pages, isLoading, error, dataUpdatedAt, refetch }
}

export interface WorkspaceListItem {
  id: string
  name: string
  repoUrl: string | null
}

type StorageGroup = { key: string; workspaces: WorkspaceListItem[] }

/** The workspaces one owner holds, and the sites that could not be asked for theirs. */
export function useWorkspaces(owner: Owner): {
  workspaces: WorkspaceListItem[] | undefined; unanswered: SiteSilence[]; isLoading: boolean
  /** The whole read, for `useBackgroundRead`. */
  read: { data: unknown; error: unknown; dataUpdatedAt: number; refetch: () => unknown }
} {
  const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery(getMyStorage)
  // Cast at the boundary, as the other readers of this query do: Wasp regenerates its inferred type only on a rebuild.
  const storage = data as { groups?: StorageGroup[]; unanswered?: SiteSilence[] } | undefined
  const group = storage?.groups?.find(g => g.key === `${owner.ownerType}:${owner.ownerId}`)
  return { workspaces: group?.workspaces, unanswered: storage?.unanswered ?? [], isLoading, read: { data, error, dataUpdatedAt, refetch } }
}
