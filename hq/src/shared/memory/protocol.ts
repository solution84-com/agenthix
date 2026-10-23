/**
 * Memory recalled by meaning (conversational experience spec, Memory and knowledge; phase 3): an item as the
 * screens see it, the limits, the probe's tiers, and the memory screen's arguments. Client-safe; `type` aliases only.
 */

export type MemoryScopeValue = 'PERSON' | 'AGENT_PERSON' | 'AGENT_PLACE'
export type MemoryItemKindValue = 'FACT' | 'PREFERENCE' | 'DECISION' | 'FEEDBACK' | 'PROJECT'
export type MemoryOutcomeKindValue = 'INCLUDED' | 'HINTED' | 'RECALLED' | 'USED' | 'UNUSED' | 'MISSED'

/** A memory is a fact, not a document: longer material is knowledge. */
export const MEMORY_BODY_MAX_CHARS = 1_500
export const MEMORY_TITLE_MAX_CHARS = 120
export const MEMORY_MAX_TAGS = 8
/** A safety net per scope, not the mechanism: dedupe and the tidy keep memory small. */
export const MEMORY_SCOPE_MAX_ITEMS = 2_000
/** Recall's defaults: the top k, and the tokens the items may take (about four characters a token). */
export const RECALL_TOP_K = 8
export const RECALL_TOKEN_BUDGET = 2_000
/** The probe: at most this many items included when certain, and named in the hint when probable. */
export const PROBE_CERTAIN_MAX = 3
export const PROBE_HINT_MAX = 3
/** Writing an item this similar to an existing one in its scope supersedes or merges instead of adding. */
export const REMEMBER_DUPLICATE_SIMILARITY = 0.92
/** An item whose hit rate stayed at zero this long is archived by the tidy. */
export const MEMORY_COLD_AFTER_DAYS = 120

/** The local embedding model's calibration, until an organisation's own numbers tune them. */
export const DEFAULT_CERTAIN_BAR = 0.62
export const DEFAULT_PROBABLE_BAR = 0.45

export type MemoryItemView = {
  id: string
  key: string
  scope: MemoryScopeValue
  /** "Everyone you work with", "Developer, about you", "Developer, in Shop". */
  scopeLabel: string
  agentId: string | null
  placeType: 'user' | 'project' | null
  placeId: string | null
  title: string
  body: string
  kind: MemoryItemKindValue
  tags: string[]
  pinned: boolean
  archived: boolean
  recallCount: number
  usedCount: number
  lastRecalledAt: string | null
  writtenBy: string | null
  updatedAt: string
}

/** The memory screen: one scope at a time. A place's scope is shown to that place's admins (a person's own space: the person). */
export type GetMemoryArgs = {
  scope: MemoryScopeValue
  agentId?: string
  place?: { type: 'user' | 'project'; id: string }
  includeArchived?: boolean
}
export type SaveMemoryItemArgs = {
  id?: string
  scope: MemoryScopeValue
  agentId?: string
  place?: { type: 'user' | 'project'; id: string }
  title: string
  body: string
  kind: MemoryItemKindValue
  tags?: string[]
}
export type MemoryItemIdArgs = { id: string }
export type SetMemoryPinnedArgs = { id: string; pinned: boolean }

/** The recall measurements, over the last 30 days, and the bars in use. */
export type MemoryMeasurements = {
  included: number
  hinted: number
  recalled: number
  used: number
  unused: number
  missed: number
  certainBar: number
  probableBar: number
}
