/** Everything the Knowledge tool reads and does, behind one module: tests replace it as a whole. */
import {
  useQuery, listKnowledgePages, getKnowledgePage, searchKnowledgePages,
  saveKnowledgePage, moveKnowledgePage, deleteKnowledgePage,
} from 'wasp/client/operations'
import { siteReadRetry } from '../../../shared/siteRead'
import type { SearchHit, SearchScope } from './search/searchScope'
import type {
  KnowledgeChangeResult, KnowledgeOwner, KnowledgePageRead, KnowledgePagesList,
} from './knowledgeTypes'

export interface Read<T> {
  data: T | undefined
  isLoading: boolean
  error: Error | null
  /** Reads it again, after a change made elsewhere on screen, or from Try again. */
  refetch: () => unknown
  /** When the data on screen was read, for `useBackgroundRead`. */
  dataUpdatedAt: number
}

/** A search's answer: the levels that could not be searched are named, since their pages are missing, not none. */
export interface SearchRead extends Read<SearchHit[]> {
  unanswered?: string[]
}

// Wasp's inferred types are cast at this boundary, as the other Files tools do.
export function useKnowledgePages(owner: KnowledgeOwner, enabled = true): Read<KnowledgePagesList> {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery(listKnowledgePages, { owner }, { enabled, retry: siteReadRetry })
  return { data: data as KnowledgePagesList | undefined, isLoading, error, refetch, dataUpdatedAt }
}

export function useKnowledgePageContent(owner: KnowledgeOwner, page: string, enabled = true): Read<KnowledgePageRead> {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery(getKnowledgePage, { owner, page }, { enabled, retry: siteReadRetry })
  return { data: data as KnowledgePageRead | undefined, isLoading, error, refetch, dataUpdatedAt }
}

/** A page read once, outside a screen: what a conflict shows of the change that came first. */
export const readKnowledgePage = async (owner: KnowledgeOwner, page: string) =>
  (await getKnowledgePage({ owner, page })) as KnowledgePageRead

export const saveKnowledge = async (args: { owner: KnowledgeOwner; page: string; content: string; baseVersion: string | null }) =>
  (await saveKnowledgePage(args)) as KnowledgeChangeResult

export const moveKnowledge = async (args: { owner: KnowledgeOwner; from: string; to: string; baseVersion: string }) =>
  (await moveKnowledgePage(args)) as KnowledgeChangeResult

export const deleteKnowledge = async (args: { owner: KnowledgeOwner; page: string }) =>
  (await deleteKnowledgePage(args)) as KnowledgeChangeResult

/**
 * The search over a place's knowledge, for what the person typed (never a pattern: hq escapes it). From the
 * organisation's own place there is only itself to search.
 */
export function useKnowledgeSearch(owner: KnowledgeOwner, text: string, scope: SearchScope): SearchRead {
  const pattern = text.trim()
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery(
    searchKnowledgePages, { owner, pattern, scope: owner.ownerType === 'org' ? 'this' : scope }, { enabled: pattern !== '', retry: siteReadRetry },
  )
  const answer = data as { hits: SearchHit[]; levels: { level: string; name: string }[]; unanswered: string[] } | undefined
  const unanswered = answer?.unanswered.map(level => answer.levels.find(l => l.level === level)?.name ?? level)
  return { data: answer?.hits, isLoading, error, unanswered, refetch, dataUpdatedAt }
}
