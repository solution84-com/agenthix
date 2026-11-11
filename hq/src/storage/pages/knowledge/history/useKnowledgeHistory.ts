/** The history screens' reads and changes, behind one module (the operations for people, `hq/src/knowledge/people/`). */
import {
  useQuery, useAction, getKnowledgePage, knowledgePageVersions, recentlyDeletedKnowledge,
  restoreKnowledgeVersion, deleteKnowledgePage,
} from 'wasp/client/operations'
import { retryUnlessGone } from '../readRetry'
import type { KnowledgeOwner, VersionRow, DeletedRow, ChangeAuthorView } from './types'

export interface Read<T> {
  data: T | undefined
  isLoading: boolean
  error: Error | null
  /** For Try again, and `useBackgroundRead`. */
  refetch: () => unknown
  dataUpdatedAt: number
}

type Q = { data: unknown; isLoading: boolean; error: unknown; refetch: () => unknown; dataUpdatedAt: number }

// Wasp types each result from the operation; the screens' own shapes (types.ts) are the contract, so cast once here.
const read = <T,>(q: Q): Read<T> =>
  ({ data: q.data as T | undefined, isLoading: q.isLoading, error: (q.error as Error | null) ?? null, refetch: q.refetch, dataUpdatedAt: q.dataUpdatedAt })

type Now = { version: string; lastChange?: { at: string; by: ChangeAuthorView } }
type Kept = { versions: Array<{ id: string; version: string; savedAt: string; by?: ChangeAuthorView }>; truncated?: boolean }

/**
 * A page's versions, newest first. The operation lists the kept earlier versions, each with the person or agent who
 * made it and `savedAt`, when it stopped being the page. So a kept version was made when the next older one stopped
 * being the page; the oldest kept one has no known time. The page as it is now is added on top from the page itself.
 */
export function useVersionRows(owner: KnowledgeOwner, page: string): Read<VersionRow[]> {
  const now = useQuery(getKnowledgePage, { owner, page }, { retry: retryUnlessGone })
  const kept = useQuery(knowledgePageVersions, { owner, page }, { retry: retryUnlessGone })
  const current = now.data as Now | undefined
  const keptRows = (kept.data as Kept | undefined)?.versions
  const rows = current && keptRows && [
    { version: current.version, at: current.lastChange?.at ?? '', by: current.lastChange?.by },
    ...keptRows.map((v, i): VersionRow => ({
      id: v.id, version: v.version, at: keptRows[i + 1]?.savedAt ?? '', by: v.by, created: i === keptRows.length - 1 && !(kept.data as Kept).truncated,
    })),
  ]
  return read({
    data: rows, isLoading: now.isLoading || kept.isLoading, error: now.error ?? kept.error,
    refetch: () => { void now.refetch(); void kept.refetch() }, dataUpdatedAt: Math.min(now.dataUpdatedAt, kept.dataUpdatedAt),
  })
}

/** One version's whole text; no `versionId` is the page as it is now. */
export function useVersionText(owner: KnowledgeOwner, page: string, versionId: string | undefined, enabled = true): Read<string> {
  const q = useQuery(getKnowledgePage, { owner, page, versionId }, { enabled, retry: retryUnlessGone })
  return read({ ...q, data: (q.data as { content: string } | undefined)?.content })
}

export function useDeletedPages(owner: KnowledgeOwner): Read<DeletedRow[]> & { truncated?: boolean } {
  const q = useQuery(recentlyDeletedKnowledge, { owner }, { retry: retryUnlessGone })
  const answer = q.data as { pages: DeletedRow[]; truncated?: boolean } | undefined
  return { ...read<DeletedRow[]>({ ...q, data: answer?.pages }), truncated: answer?.truncated }
}

export function useHistoryActions() {
  return { restore: useAction(restoreKnowledgeVersion), deleteForGood: useAction(deleteKnowledgePage) }
}
