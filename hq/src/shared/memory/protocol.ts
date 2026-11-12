/**
 * Memory recalled by meaning (conversational experience spec, Memory and knowledge; ADR-0188): an item as the
 * screens see it, the limits, the probe's tiers, and the memory screen's arguments. Client-safe; `type` aliases only.
 */

/**
 * The three scopes before ADR-0188, as the memory screen's address and an old conversation's "Remembered" line may
 * still name them. A memory's scope is now its person, optional agent and optional place.
 * @deprecated Read only from old addresses and stored lines; nothing new is written with it.
 */
export type MemoryScopeValue = 'PERSON' | 'AGENT_PERSON' | 'AGENT_PLACE'
/** A Fact is something true about the person; a Rule, how they want things done. */
export type MemoryItemKindValue = 'FACT' | 'RULE'
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

/** A place as a memory's scope or saved-in place names it, with its name now. */
export type MemoryPlaceView = { type: 'user' | 'project'; id: string; name: string }

export type MemoryItemView = {
  id: string
  key: string
  /** The one agent it holds for, or null for every agent. */
  agent: { id: string; name: string } | null
  /** The one place it holds in, or null for everywhere. */
  place: MemoryPlaceView | null
  /** The agent that saved it; null once that agent is deleted. */
  savedBy: { id: string; name: string } | null
  /** The place it was saved in; null once that place is gone. */
  savedIn: MemoryPlaceView | null
  /** The conversation it was saved in; null for a run's, or once that conversation is deleted. Since client protocol 1.23. */
  savedInConversationId: string | null
  title: string
  body: string
  kind: MemoryItemKindValue
  tags: string[]
  archived: boolean
  recallCount: number
  usedCount: number
  lastRecalledAt: string | null
  createdAt: string
  updatedAt: string
  /** @deprecated since client protocol 1.23: read `agent`. */
  agentId: string | null
  /** @deprecated since client protocol 1.23: read `place`. */
  placeType: 'user' | 'project' | null
  /** @deprecated since client protocol 1.23: read `place`. */
  placeId: string | null
  /** @deprecated since client protocol 1.23: `AGENT_PERSON` when `agent` is set, else `PERSON`; read `agent` and `place`. */
  scope: MemoryScopeValue
  /** @deprecated since client protocol 1.23: the two badges' words, "Kernel, Shop"; read `agent` and `place`. */
  scopeLabel: string
  /** @deprecated since client protocol 1.23: always false, nothing is pinned (ADR-0188). */
  pinned: boolean
  /** @deprecated since client protocol 1.23: read `savedBy`. */
  writtenBy: string | null
}

/**
 * The person's own memories, newest first. `agentId` and `place` match the scope exactly: null is "every agent" or
 * "everywhere", absent is any; so do `kind` and `tag`.
 */
export type GetMemoryArgs = {
  /** One memory by its id, as the dialog opens it; absent is any. */
  id?: string
  agentId?: string | null
  place?: { type: 'user' | 'project'; id: string } | null
  kind?: MemoryItemKindValue
  /** One tag, matched exactly. */
  tag?: string
  /** Words that must each be in the title, the body or a tag, in any case. */
  words?: string
  includeArchived?: boolean
  /** @deprecated since client protocol 1.23: ignored; the list holds every scope, narrowed by `agentId` and `place`. */
  scope?: MemoryScopeValue
}

/** What the memory screen's menus offer: every agent, place and tag the person's memories name, with current names. */
export type MemoryChoices = {
  agents: { id: string; name: string }[]
  places: MemoryPlaceView[]
  tags: string[]
}
/** @deprecated A person no longer adds or edits a memory (ADR-0188); the action refuses. */
export type SaveMemoryItemArgs = {
  id?: string
  title: string
  body: string
  kind: MemoryItemKindValue
  tags?: string[]
}
export type MemoryItemIdArgs = { id: string }
/** @deprecated Nothing is pinned any more (ADR-0188); the action refuses. */
export type SetMemoryPinnedArgs = { id: string; pinned: boolean }
/** A memory's scope, from its two switches: its saving agent or every agent, its saved-in place or everywhere. */
export type MemoryScopeChoice = { agent: 'saved' | 'every'; place: 'saved' | 'everywhere' }

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
