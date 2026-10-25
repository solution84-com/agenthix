/**
 * What hq's knowledge operations for people need from outside themselves: the sites holding pages (the same
 * `KnowledgeSites` the agents' service uses), who may read and change which owner's pages, the change record, and
 * who made each recorded change. Taken as one object so the rules are tested with each replaced; `index.ts` wires
 * the real ones.
 */
import type { KnowledgeOwnerRef } from '@agenthix/core'
import type { KnowledgeChangeEntry, KnowledgeSites, SiteFailure } from '../deps'
import type { ChangeAuthorView, KnowledgeLastChange, KnowledgeOwner } from './types'

/** A refusal a person reads, with the HTTP status the operation answers it with. */
export class KnowledgeRefusal extends Error {
  constructor(readonly status: 400 | 403 | 404 | 413 | 415 | 429 | 502 | 503, message: string) {
    super(message)
    this.name = 'KnowledgeRefusal'
  }
}

/** One owner's pages as the person may reach them: where they are, what the level is called, and whether they may change it. */
export type OwnerAccess = {
  ref: KnowledgeOwnerRef
  /** The level's name, as pages are named to agents (`website-rebuild`, `personal`, `org`). */
  level: string
  /** As a screen names it: the project's name, "Your space", "Organisation". */
  name: string
  canChange: boolean
}

/** Who made recorded changes, joined to a site's pages and versions by page and version (G5). */
export interface ChangeAuthors {
  /** The last recorded change that left each page at the version given; a page changed outside the gate has none. */
  lastChanges(ref: KnowledgeOwnerRef, pages: { page: string; version: string }[]): Promise<Map<string, KnowledgeLastChange>>
  /** Who wrote each kept version of a page: the latest change that left the page at its text before it was kept. By id. */
  ofVersions(ref: KnowledgeOwnerRef, page: string, versions: { id: string; version: string; savedAt: string }[]): Promise<Map<string, ChangeAuthorView>>
  /** Who deleted each page, from its deletion's record. By page. */
  deletions(ref: KnowledgeOwnerRef, pages: { page: string; version: string }[]): Promise<Map<string, ChangeAuthorView>>
}

export interface PeopleKnowledgeDeps {
  sites: KnowledgeSites
  /** The person's access to an owner's pages; throws when they may not read them. */
  open(owner: KnowledgeOwner, userId: string): Promise<OwnerAccess>
  recordChange(entry: KnowledgeChangeEntry): Promise<void>
  authors: ChangeAuthors
  /** How long a search, and the reads that find what links to a page, wait for a site. */
  siteTimeLimitMs: number
  log: { warn(message: string, fields?: Record<string, unknown>): void }
}

const AGAIN = 'Try again shortly; whoever runs the site holding it can check it is running and up to date.'

/** Why a site could not answer, in words: from the fixed set, never the site's own error (S6). */
export function siteRefusal(why: SiteFailure, changing: boolean): KnowledgeRefusal {
  const unchanged = changing ? ' Nothing was changed.' : ''
  switch (why) {
    case 'unreachable': return new KnowledgeRefusal(503, `The site that holds this knowledge can't be reached. ${AGAIN}${unchanged}`)
    case 'outdated': return new KnowledgeRefusal(503, `The site that holds this knowledge needs updating before it can do this; whoever runs it can update it.${unchanged}`)
    case 'not_found': return new KnowledgeRefusal(404, `There is no such page here: it may have been moved or deleted.${unchanged}`)
    case 'too_large': return new KnowledgeRefusal(413, `This page is too large to open here.${unchanged}`)
    case 'invalid': return new KnowledgeRefusal(400, `That page name can't be used here. Check its name.${unchanged}`)
    case 'failed': return new KnowledgeRefusal(502, `The site that holds this knowledge could not finish. ${AGAIN}${unchanged}`)
  }
}
