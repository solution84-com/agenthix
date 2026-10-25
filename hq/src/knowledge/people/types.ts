/**
 * The shapes of hq's knowledge operations for people (agent knowledge spec, part 5): what the Knowledge tool, History
 * and Recently deleted read and change. Types only, so the screens import them as they are; `type` aliases, not
 * interfaces, since a Wasp operation's payload must be a plain object type.
 */
import type {
  KnowledgeChangeKind,
  KnowledgeChangeResult,
  KnowledgePageListing,
  KnowledgeSection,
  KnowledgeVersion,
} from '@agenthix/core'

/**
 * Core's shapes, as plain object types: core declares some as interfaces, which a Wasp payload cannot be (an
 * interface has no index signature, so it is not a JSON object to the compiler).
 */
export type Plain<T> = T extends readonly (infer U)[] ? Plain<U>[] : T extends object ? { [K in keyof T]: Plain<T[K]> } : T

/**
 * Whose knowledge: a project's, a person's own (their space and personal projects), or the organisation's. The
 * organisation's `ownerId` is ignored when given (a work step names it `org`): there is one.
 */
export type KnowledgeOwner = { ownerType: 'project' | 'user'; ownerId: string } | { ownerType: 'org'; ownerId?: string }

/** Who made a change, as a screen names them: a person, or an agent with the person it answered (G5). */
export type ChangeAuthorView =
  | { kind: 'person'; name: string }
  | { kind: 'agent'; agentName: string; forName: string; conversationId?: string; runId?: string }

export type KnowledgeLastChange = { at: string; by: ChangeAuthorView; change: KnowledgeChangeKind }

export type KnowledgePageRow = Plain<KnowledgePageListing> & { lastChange?: KnowledgeLastChange }

export type KnowledgePagesList = {
  sections: Plain<KnowledgeSection>[]
  pages: KnowledgePageRow[]
  /** Whether the person may make, edit, move, delete and restore pages here. */
  canChange: boolean
  /** The listing stopped at the most a place may hold. */
  truncated: boolean
}

export type KnowledgePageView = {
  page: string
  content: string
  /** The page's version (the hash of its text): what a save starts from. A kept version's own, when one was asked for. */
  version: string
  lastChange?: KnowledgeLastChange
  /** The pages of the same place that link here. */
  linkedFrom: string[]
  canChange: boolean
}

export type KnowledgeVersionRow = Plain<KnowledgeVersion> & { by?: ChangeAuthorView }

export type RecentlyDeletedPage = {
  page: string
  deletedAt: string
  by?: ChangeAuthorView
  removeAfter: string
  /** The kept version holding the page as it was: what Restore and Delete permanently name. */
  versionId: string
}

export type KnowledgeSearchScope = 'this' | 'org' | 'both'

/** One result per page: its title and description, and the first lines of its text that match (none when only its front matter did). */
export type KnowledgeSearchHitRow = {
  level: string
  page: string
  title: string
  description?: string
  matches: { line: number; text: string }[]
}

export type KnowledgeSearchAnswer = {
  hits: KnowledgeSearchHitRow[]
  /** The levels searched, in the order their hits come, with each one's name as shown. */
  levels: { level: string; name: string }[]
  /** Levels whose site could not answer in time: their hits are missing, not none. */
  unanswered: string[]
}

/** A change's answer: core's, and on a conflict who made the change the person's text would have gone over. */
export type KnowledgeChangeAnswer = Plain<KnowledgeChangeResult> & { lastChange?: KnowledgeLastChange }
