/**
 * Who may reach which level (agent knowledge spec, parts 3 and 4), and how a page's name picks its level. A name
 * starts with its level — a place's key (`website-rebuild:`, `personal:`), `org:` or `platform:` — and a level is
 * resolved in that order: `platform`, `org`, `personal`, then a project's key among the reach's places. Nothing here
 * can name a place the reach does not hold.
 */
import { KNOWLEDGE_ORG_OWNER_ID, type KnowledgeOwnerRef, type KnowledgeStepView } from '@agenthix/core'

/** What one caller may reach: built from a run's capability or a conversation's turn. */
export interface KnowledgeReach {
  /** The places, most specific first: the run's one place, or the places a conversation reaches. */
  places: { level: string; owner: KnowledgeOwnerRef }[]
  /** The person the call acts for. */
  userId: string
  /** Set for an agent: who to record (G5). */
  agent?: { agentId: string; conversationId?: string; runId?: string }
  /** False for a turn that does not answer a person, or a run without write tools: change calls refuse. */
  mayChange: boolean
  /** The key the rate limit and the read-before-write record use: the run's or the conversation's id. */
  callerKey: string
  /** Told what each call did, for the conversation's work step; set only for a conversation's turn (`./steps.ts`). */
  onStep?: (step: KnowledgeStepView) => void
}

export const PLATFORM_LEVEL = 'platform'
export const ORG_LEVEL = 'org'
export const PERSONAL_LEVEL = 'personal'
const RESERVED = new Set([PLATFORM_LEVEL, ORG_LEVEL])

export const ORG_OWNER: KnowledgeOwnerRef = { ownerType: 'org', ownerId: KNOWLEDGE_ORG_OWNER_ID }

/** A level a call may reach: the platform guide, or a site-held owner's pages (a place, or the organisation's). */
export type Level =
  | { kind: 'platform'; name: typeof PLATFORM_LEVEL }
  | { kind: 'org' | 'place'; name: string; owner: KnowledgeOwnerRef }

/**
 * Every level the reach may see, in the order a search answers: its places as given, then the organisation, then the
 * guide. A place whose key is `org` or `platform`, or repeats an earlier one, could never be named, so it is left out
 * rather than shown under a name that reads as another level's.
 */
export function levelsOf(reach: KnowledgeReach): Level[] {
  const seen = new Set<string>()
  const places: Level[] = []
  for (const p of reach.places) {
    if (RESERVED.has(p.level) || seen.has(p.level) || !p.level) continue
    seen.add(p.level)
    places.push({ kind: 'place', name: p.level, owner: p.owner })
  }
  return [...places, { kind: 'org', name: ORG_LEVEL, owner: ORG_OWNER }, { kind: 'platform', name: PLATFORM_LEVEL }]
}

/** The level a name names, among those the reach holds; null when it holds none by that name. */
export function resolveLevel(reach: KnowledgeReach, name: string): Level | null {
  return levelsOf(reach).find(l => l.name === name) ?? null
}

/** The names of the levels the reach holds, as a refusal lists them: `website-rebuild:, org:, platform:`. */
export function levelNames(reach: KnowledgeReach): string {
  return levelsOf(reach).map(l => `${l.name}:`).join(', ')
}

export type SplitName = { level: string; rest: string } | null

/** `website-rebuild:processes/release.md` → its level and the page inside it; null with no level. */
export function splitName(name: string): SplitName {
  const at = name.indexOf(':')
  if (at <= 0) return null
  return { level: name.slice(0, at), rest: name.slice(at + 1) }
}

/** A stable key for an owner's page, for the read-before-write record. */
export function pageKey(owner: KnowledgeOwnerRef, page: string): string {
  return `${owner.ownerType}:${owner.ownerId}\u0000${page}`
}
