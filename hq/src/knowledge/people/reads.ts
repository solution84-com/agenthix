/**
 * What a person reads of a place's knowledge (agent knowledge spec, part 5, U2–U4): the sections and pages the site's
 * itemiser lists, a page or one of its kept versions, a page's history and the recently deleted pages — each with who
 * made it, from hq's record of changes. Access is checked before any site is asked (ADR-0042).
 */
import { KNOWLEDGE_LIST_MAX_FILES, type KnowledgeVersion } from '@agenthix/core'
import { versionOf } from '@agenthix/core/file-tools'
import { KnowledgeRefusal, type PeopleKnowledgeDeps } from './deps'
import { linkedFrom } from './linkedFrom'
import { fromSite, requirePageName } from './site'
import type {
  KnowledgeOwner, KnowledgePagesList, KnowledgePageView, KnowledgeVersionRow, RecentlyDeletedPage,
} from './types'

const DELETED_KEPT_MS = 30 * 24 * 60 * 60 * 1000
/** A listing walks every page of a place, up to 2,000: it may take longer than a search. */
export const LIST_TIME_LIMIT_MS = 30_000
const VERSION_ID = /^\d{8}T\d{9}Z-[0-9a-f]{8}$/

export function requireVersionId(id: unknown, changing: boolean): string {
  if (typeof id !== 'string' || !VERSION_ID.test(id)) {
    throw new KnowledgeRefusal(400, `That is not one of this page's versions. Open its History to see the ones kept.${changing ? ' Nothing was changed.' : ''}`)
  }
  return id
}

export async function listPages(deps: PeopleKnowledgeDeps, owner: KnowledgeOwner, userId: string): Promise<KnowledgePagesList> {
  const access = await deps.open(owner, userId)
  const listing = await fromSite(deps, 'list', false, () => deps.sites.list(access.ref, LIST_TIME_LIMIT_MS))
  const pages = listing.pages ?? []
  const last = await deps.authors.lastChanges(access.ref, pages.map(p => ({ page: p.page, version: p.version })))
  return {
    sections: listing.sections ?? [],
    pages: pages.map(p => {
      const lastChange = last.get(p.page)
      return lastChange ? { ...p, lastChange } : p
    }),
    canChange: access.canChange,
    truncated: listing.truncated || pages.length >= KNOWLEDGE_LIST_MAX_FILES,
  }
}

export async function readPage(
  deps: PeopleKnowledgeDeps, owner: KnowledgeOwner, input: { page: unknown; versionId?: unknown }, userId: string,
): Promise<KnowledgePageView> {
  const page = requirePageName(input.page, false)
  const versionId = input.versionId === undefined || input.versionId === null ? undefined : requireVersionId(input.versionId, false)
  const access = await deps.open(owner, userId)
  const bytes = await fromSite(deps, 'read', false, () => deps.sites.read(access.ref, page, versionId))
  const content = Buffer.from(bytes).toString('utf8')
  if (content.includes('\0')) throw new KnowledgeRefusal(415, 'This file is not text, so it is not a page. Download it from Files instead.')
  const version = versionOf(bytes)
  if (versionId) return { page, content, version, linkedFrom: [], canChange: access.canChange }
  const [last, linking] = await Promise.all([
    deps.authors.lastChanges(access.ref, [{ page, version }]),
    linkedFrom(deps, access.ref, access.level, page),
  ])
  const lastChange = last.get(page)
  return { page, content, version, ...(lastChange ? { lastChange } : {}), linkedFrom: linking, canChange: access.canChange }
}

export async function pageVersions(
  deps: PeopleKnowledgeDeps, owner: KnowledgeOwner, input: { page: unknown }, userId: string,
): Promise<{ versions: KnowledgeVersionRow[]; truncated: boolean }> {
  const page = requirePageName(input.page, false)
  const access = await deps.open(owner, userId)
  const kept = await fromSite(deps, 'versions', false, () => deps.sites.versions(access.ref, page))
  const by = await deps.authors.ofVersions(access.ref, page, kept.versions.map(v => ({ id: v.id, version: v.version, savedAt: v.savedAt })))
  return {
    versions: kept.versions.map((v: KnowledgeVersion) => {
      const who = by.get(v.id)
      return who ? { ...v, by: who } : v
    }),
    truncated: kept.truncated,
  }
}

/** Pages deleted and kept until pruned. A page moved away is not among them: it lives on under its new name. */
export async function recentlyDeleted(
  deps: PeopleKnowledgeDeps, owner: KnowledgeOwner, userId: string,
): Promise<{ pages: RecentlyDeletedPage[]; canChange: boolean; truncated: boolean }> {
  const access = await deps.open(owner, userId)
  const kept = await fromSite(deps, 'versions', false, () => deps.sites.versions(access.ref))
  const deleted = kept.versions.filter(v => v.change === 'deleted')
  const by = await deps.authors.deletions(access.ref, deleted.map(v => ({ page: v.page, version: v.version })))
  return {
    pages: deleted.map(v => {
      const who = by.get(v.page)
      return {
        page: v.page,
        deletedAt: v.savedAt,
        ...(who ? { by: who } : {}),
        removeAfter: v.removeAfter ?? new Date(Date.parse(v.savedAt) + DELETED_KEPT_MS).toISOString(),
        versionId: v.id,
      }
    }),
    canChange: access.canChange,
    truncated: kept.truncated,
  }
}
