/**
 * *Linked from* (agent knowledge spec, part 5, U3): the pages of the same place whose links lead to a page. The site
 * lists no links, so the place's pages are searched for the page's file name, as a fixed string, and each page found
 * is read and its links resolved by core's `pageLinks`, the same rule the itemiser checks links by. Bounded: a name
 * found in more pages than this reads only the first of them.
 */
import { pageLinks, type KnowledgeOwnerRef } from '@agenthix/core'
import { withDeadline } from '../deadline'
import type { PeopleKnowledgeDeps } from './deps'

export const LINKED_FROM_MAX_READS = 20

/** A fixed string as a pattern ripgrep reads literally. */
export function literalPattern(text: string): string {
  return text.replace(/[\\.+*?()|[\]{}^$#&~-]/g, '\\$&')
}

function baseName(page: string): string {
  return page.slice(page.lastIndexOf('/') + 1)
}

/** Whether `text`, the page `from` of the level `level`, links to `page`. */
export function linksTo(from: string, text: string, level: string, page: string): boolean {
  return pageLinks(from, text).some(link => link.page === page && (link.level === null || link.level === level))
}

async function linkedFromUnbounded(deps: PeopleKnowledgeDeps, ref: KnowledgeOwnerRef, level: string, page: string): Promise<string[]> {
  const found = await deps.sites.grep(ref, {
    pattern: literalPattern(baseName(page)),
    output_mode: 'files_with_matches',
    '-i': false,
    head_limit: LINKED_FROM_MAX_READS + 1,
  }, deps.siteTimeLimitMs)
  if (!found.ok || found.value.outcome !== 'done') return []
  const candidates = [...new Set(found.value.hits.map(h => h.page))].filter(p => p !== page).slice(0, LINKED_FROM_MAX_READS)
  const linking = await Promise.all(candidates.map(async from => {
    const bytes = await deps.sites.read(ref, from)
    if (!bytes.ok) return null
    return linksTo(from, Buffer.from(bytes.value).toString('utf8'), level, page) ? from : null
  }))
  return linking.filter((p): p is string => p !== null).sort()
}

/** Never a reason for a page not to open: anything that goes wrong is no pages listed. */
export async function linkedFrom(deps: PeopleKnowledgeDeps, ref: KnowledgeOwnerRef, level: string, page: string): Promise<string[]> {
  try {
    const answer = await withDeadline(linkedFromUnbounded(deps, ref, level, page), deps.siteTimeLimitMs)
    return answer === 'timeout' ? [] : answer
  } catch (err) {
    deps.log.warn('knowledge linked-from failed', { error: err instanceof Error ? err.name : 'unknown' })
    return []
  }
}
