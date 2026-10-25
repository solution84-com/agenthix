import type { ChangeAuthorView, KnowledgeOwner } from '../knowledgeTypes'

export type { ChangeAuthorView, KnowledgeOwner }

/** One version of a page, newest first. `id` is absent for the page as it is now. */
export interface VersionRow {
  id?: string
  /** The page's version (the hash of its text), which a work step's *See change* names. */
  version: string
  /** When this version was made; empty when it is not known (the oldest kept one). */
  at: string
  /** Who made this version. */
  by?: ChangeAuthorView
  /** The oldest version kept, and the list is not cut short: the page was created in it. */
  created?: boolean
}

export interface DeletedRow {
  page: string
  deletedAt: string
  by?: ChangeAuthorView
  removeAfter: string
  versionId: string
}
