/**
 * Finding what a conversation's runs said (on-screen spec, A conversation's runs are found from it). The sites are
 * asked only here, when a search is made: each run's own record is read from its site, and a site that cannot be
 * reached is named rather than skipped in silence.
 */
import type { RunRow } from '@agenthix/core'
import type { ConversationRunHit } from '../../shared/conversations/protocol'

const EXCERPT_RADIUS = 80
export const RUN_SEARCH_MAX_RUNS = 100
export const RUN_SEARCH_MAX_HITS = 50

export type SearchedOperation = { siteId: string; runId: string; title: string | null; at: Date }
export type RunSearchDeps = {
  /** One run from its site; throws when the site cannot answer. */
  getRun: (siteId: string, runId: string) => Promise<RunRow | null>
  /** A site as a person reads it. */
  siteName: (siteId: string) => Promise<string>
}

/** The words around the first match in what a run was asked or answered, or null when it said nothing of the kind. */
export function excerptOf(run: Pick<RunRow, 'inputText' | 'outputText'>, query: string): string | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return null
  for (const text of [run.outputText ?? '', run.inputText]) {
    const at = text.toLowerCase().indexOf(needle)
    if (at < 0) continue
    const from = Math.max(0, at - EXCERPT_RADIUS)
    const to = Math.min(text.length, at + needle.length + EXCERPT_RADIUS)
    const body = text.slice(from, to).replace(/\s+/g, ' ').trim()
    return `${from > 0 ? '…' : ''}${body}${to < text.length ? '…' : ''}`
  }
  return null
}

export async function searchRuns(
  operations: SearchedOperation[],
  query: string,
  deps: RunSearchDeps,
): Promise<{ hits: ConversationRunHit[]; unavailable: string[] }> {
  const needle = query.trim()
  if (!needle) return { hits: [], unavailable: [] }
  const bySite = new Map<string, SearchedOperation[]>()
  for (const op of operations.slice(0, RUN_SEARCH_MAX_RUNS)) bySite.set(op.siteId, [...(bySite.get(op.siteId) ?? []), op])

  const hits: ConversationRunHit[] = []
  const unavailable: string[] = []
  await Promise.all([...bySite].map(async ([siteId, ops]) => {
    try {
      for (const op of ops) {
        const run = await deps.getRun(siteId, op.runId)
        const excerpt = run ? excerptOf(run, needle) : null
        if (run && excerpt) hits.push({ runId: op.runId, sessionId: run.sessionId, siteId, title: op.title, at: (run.startedAt ?? op.at.toISOString()), excerpt })
      }
    } catch {
      unavailable.push(await deps.siteName(siteId))
    }
  }))
  hits.sort((a, b) => b.at.localeCompare(a.at))
  return { hits: hits.slice(0, RUN_SEARCH_MAX_HITS), unavailable: unavailable.sort() }
}
