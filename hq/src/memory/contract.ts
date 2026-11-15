/**
 * The seams of memory recalled by meaning (memory and knowledge spec; phase 3). The store, the embedder, the probe
 * and knowledge delivery each implement their side against these types; the conversation layer and the tools are
 * written against them alone.
 */
import type { MemoryItemKindValue, MemoryScopeChoice } from '../shared/memory/protocol'

/** One organisation's embedding model. `embed` returns one unit-length vector per text, in order. */
export interface Embedder {
  readonly model: string
  readonly dimensions: number
  embed(texts: string[]): Promise<number[][]>
}

export interface Place { type: 'user' | 'project'; id: string }

/**
 * Who reads or writes (ADR-0188): `personId` is the person the turn or run is for — null for a run nobody
 * commissioned (a pulse, a routine) or work others read, which reaches no memory at all; `agentId` the agent at
 * work; `place` the conversation's place or the run's boundary.
 */
export interface MemoryPrincipal {
  personId: string | null
  agentId: string
  place: Place | null
}

/** What `remember` keeps. Its scope is not an argument: hq sets it from the principal (the person, agent and place). */
export interface RememberInput {
  title: string
  body: string
  kind: MemoryItemKindValue
  tags?: string[]
  /** Replaces the item with this key in the scope; assigned from the title's slug when absent. */
  key?: string
  /** The person asked for it ("remember…", or a correction): only then may a Rule replace a memory they promoted. */
  requested?: boolean
  /** The conversation it is saved in, set by hq from the turn; a run saves in none. */
  conversationId?: string | null
}

export type RememberOutcome =
  | { status: 'added' | 'replaced' | 'superseded' | 'merged'; key: string; itemId: string; alreadyHeld?: { title: string } }
  | { status: 'refused'; reason: string }

/** An item as recall returns it, with its provenance. `similarity` is absent for a read by key. */
export interface RecalledItem {
  itemId: string
  key: string
  title: string
  body: string
  kind: MemoryItemKindValue
  tags: string[]
  similarity?: number
  score?: number
  writtenAt: string
}

export interface RecallOptions {
  k?: number
  tokenBudget?: number
  includeArchived?: boolean
  /** Only memories of this kind. */
  kind?: MemoryItemKindValue
  /** Only memories carrying any of these tags. */
  tags?: string[]
}

export type OutcomeKind = 'INCLUDED' | 'HINTED' | 'RECALLED' | 'USED' | 'UNUSED' | 'MISSED'

export interface OutcomeInput {
  itemId: string
  kind: OutcomeKind
  similarity?: number
  /** An INCLUDED Rule that only its kind's weight brought in: the bar tuner leaves it out. */
  weighted?: boolean
  turnId?: string
}

export type ScopeChangeOutcome =
  | { status: 'changed' | 'unchanged'; itemId: string }
  /** It met a memory alike in the new scope and was joined to it, or found already said there: `itemId` is that one. */
  | { status: 'joined'; itemId: string }
  | { status: 'refused'; reason: string }

export interface MemoryService {
  remember(principal: MemoryPrincipal, input: RememberInput): Promise<RememberOutcome>
  /** Forgets the most specific memory with this key the principal could recall. */
  forget(principal: MemoryPrincipal, key: string): Promise<boolean>
  recallByKey(principal: MemoryPrincipal, keys: string[]): Promise<RecalledItem[]>
  /** Score = similarity × warmth; cut at k and the token budget. A string query is embedded once. */
  recallByQuery(principal: MemoryPrincipal, query: string | number[], options?: RecallOptions): Promise<{ items: RecalledItem[]; cut: string[] }>
  /** Every memory of a kind or carrying any of the tags, newest first; cut at k and the token budget. */
  recallFiltered(principal: MemoryPrincipal, options: RecallOptions): Promise<{ items: RecalledItem[]; cut: string[] }>
  recordOutcomes(outcomes: OutcomeInput[]): Promise<void>
  /** The person promotes their memory, or flips it back to the agent or place it was saved by or in. */
  setScope(personId: string, itemId: string, choice: MemoryScopeChoice): Promise<ScopeChangeOutcome>
  /** The person forgets their own memory; false when there is none of theirs with that id. */
  forgetOwn(personId: string, itemId: string): Promise<boolean>
}

/** The probe before a turn (spec, What decides a recall): nothing stored; the composed query's vector is discarded. */
export interface ProbeResult {
  /** Included in full; `weighted` when only a Rule's weight brought it up from the hint. */
  certain: (RecalledItem & { weighted?: boolean })[]
  probable: { key: string; title: string; similarity: number }[]
}
export type Probe = (principal: MemoryPrincipal, composedQuery: string) => Promise<ProbeResult>
