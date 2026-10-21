/**
 * The seams of memory recalled by meaning (memory and knowledge spec; phase 3). The store, the embedder, the probe
 * and knowledge delivery each implement their side against these types; the conversation layer and the tools are
 * written against them alone.
 */
import type { MemoryItemKindValue, MemoryScopeValue } from '../shared/memory/protocol'

/** One organisation's embedding model. `embed` returns one unit-length vector per text, in order. */
export interface Embedder {
  readonly model: string
  readonly dimensions: number
  embed(texts: string[]): Promise<number[][]>
}

export interface Place { type: 'user' | 'project'; id: string }

/**
 * Who reads or writes, and so which scopes they reach (spec, Knowledge delivery's table): `personId` is the person
 * the turn or run is for — null for a run nobody commissioned (a pulse, a routine), which reaches agent × place
 * only; `place` is the conversation's place or the run's boundary.
 */
export interface MemoryPrincipal {
  personId: string | null
  agentId: string
  place: Place | null
}

export interface RememberInput {
  scope: MemoryScopeValue
  title: string
  body: string
  kind: MemoryItemKindValue
  tags?: string[]
  /** Replaces the item with this key in the scope; assigned from the title's slug when absent. */
  key?: string
  pinned?: boolean
  /** Who wrote it: the agent as it worked, or the person on the memory screen. */
  writtenBy: { agentId: string } | { userId: string }
}

export type RememberOutcome =
  | { status: 'added' | 'replaced' | 'superseded' | 'merged'; key: string; itemId: string }
  | { status: 'refused'; reason: string }

/** An item as recall returns it, with its provenance. `similarity` is absent for a read by key or a pinned item. */
export interface RecalledItem {
  itemId: string
  key: string
  scope: MemoryScopeValue
  title: string
  body: string
  kind: MemoryItemKindValue
  tags: string[]
  pinned: boolean
  similarity?: number
  score?: number
  writtenAt: string
}

export interface RecallOptions {
  k?: number
  tokenBudget?: number
  includeArchived?: boolean
  /** Scopes to search, within those the principal may read; all of them when absent. */
  scopes?: MemoryScopeValue[]
}

export interface MemoryService {
  remember(principal: MemoryPrincipal, input: RememberInput): Promise<RememberOutcome>
  forget(principal: MemoryPrincipal, key: string, scope: MemoryScopeValue): Promise<boolean>
  recallByKey(principal: MemoryPrincipal, keys: string[]): Promise<RecalledItem[]>
  /** Score = similarity × warmth; pinned first; cut at k and the token budget. A string query is embedded once. */
  recallByQuery(principal: MemoryPrincipal, query: string | number[], options?: RecallOptions): Promise<{ items: RecalledItem[]; cut: string[] }>
  pinned(principal: MemoryPrincipal): Promise<RecalledItem[]>
  recordOutcomes(outcomes: { itemId: string; kind: 'INCLUDED' | 'HINTED' | 'RECALLED' | 'USED' | 'UNUSED' | 'MISSED'; similarity?: number; conversationId?: string; turnId?: string; runId?: string }[]): Promise<void>
}

/** The probe before a turn (spec, What decides a recall): nothing stored; the composed query's vector is discarded. */
export interface ProbeResult {
  certain: RecalledItem[]
  probable: { key: string; title: string; similarity: number }[]
}
export type Probe = (principal: MemoryPrincipal, composedQuery: string) => Promise<ProbeResult>

/** A bounded excerpt of a place's knowledge files, from the place's site. Not forwardable. */
export interface KnowledgeExcerpt { path: string; startLine: number; endLine: number; text: string }
export type SearchKnowledge = (
  place: Place,
  query: string,
  maxChars: number,
) => Promise<{ excerpts: KnowledgeExcerpt[]; cut: string[]; unavailable: string | null }>
