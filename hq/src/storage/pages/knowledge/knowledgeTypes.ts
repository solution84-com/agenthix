import type { KnowledgeChangeResult, KnowledgePageListing, KnowledgeSection } from '@agenthix/core'

/** Whose knowledge: a project's, a person's, or the organisation's. */
export type KnowledgeOwner = { ownerType: 'project' | 'user'; ownerId: string } | { ownerType: 'org' }

export type ChangeAuthorView =
  | { kind: 'person'; name: string }
  | { kind: 'agent'; agentName: string; forName: string; conversationId?: string; runId?: string }

export interface LastChange {
  at: string
  by: ChangeAuthorView
}

export interface KnowledgePageRow extends KnowledgePageListing {
  lastChange?: LastChange
}

export interface KnowledgePagesList {
  sections: KnowledgeSection[]
  pages: KnowledgePageRow[]
  canChange: boolean
}

export interface KnowledgePageRead {
  page: string
  content: string
  version: string
  lastChange?: LastChange
  linkedFrom: string[]
}

export type { KnowledgeChangeResult, KnowledgePageListing, KnowledgeSection }
