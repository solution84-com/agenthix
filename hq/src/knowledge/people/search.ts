/**
 * A person's search of knowledge (agent knowledge spec, part 5, U2 and U5): the words they typed, found as a fixed
 * string, in this place, the organisation's, or both — the project's switch *This project · Organisation · Both*.
 * Each level is asked at once through the same site search the agents' `search_knowledge` uses, within one time
 * limit, and each hit is marked with its level; a level that does not answer is named, never read as no hits.
 * Read-only. What a person types is never a pattern: it is escaped, so it cannot be one the guards must stop.
 */
import { checkPageChange, parseFrontMatter, titleFromPageName } from '@agenthix/core'
import { GrepRateLimiter, refusalMessage } from '@agenthix/core/file-tools'
import { withDeadline } from '../deadline'
import { KnowledgeRefusal, type OwnerAccess, type PeopleKnowledgeDeps } from './deps'
import { literalPattern } from './linkedFrom'
import type { KnowledgeOwner, KnowledgeSearchAnswer, KnowledgeSearchHitRow, KnowledgeSearchScope } from './types'

export const SEARCH_WORDS_MAX = 200
export const SEARCH_HITS_MAX = 100
/** Matching lines shown under a result. */
const EXCERPT_LINES = 2
/** Pages read for their title at once, so a broad search does not ask a site for every page. */
const PAGES_TITLED_MAX = 30
/** A person types, and the screen searches as they do: more than an agent's limit, still a limit. */
const limiter = new GrepRateLimiter(120)

const NOT_FOUND = refusalMessage('not-found')

async function levelsOf(deps: PeopleKnowledgeDeps, owner: KnowledgeOwner, scope: KnowledgeSearchScope, userId: string): Promise<OwnerAccess[]> {
  const own = await deps.open(owner, userId)
  if (own.ref.ownerType === 'org' || scope === 'this') return [own]
  const org = await deps.open({ ownerType: 'org' }, userId)
  return scope === 'org' ? [org] : [own, org]
}

type LevelAnswer = { hits: KnowledgeSearchHitRow[] } | { unanswered: true }
type LineHit = { page: string; line?: number; text?: string }

/** A page's title, description and the line its text starts on, from the page itself; null when the site cannot give it. */
async function pageFacts(deps: PeopleKnowledgeDeps, access: OwnerAccess, page: string) {
  const work = deps.sites.read(access.ref, page).catch(() => null)
  const answer = await withDeadline(work, deps.siteTimeLimitMs)
  if (answer === 'timeout' || answer === null || !answer.ok) return null
  const content = Buffer.from(answer.value).toString('utf8')
  if (content.includes('\0')) return null
  const { summary } = checkPageChange(page, content)
  const front = parseFrontMatter(content)
  return { title: summary.title, description: summary.description, bodyLine: front.problems.length ? 1 : front.bodyLine }
}

/** One result per page, in the order the site found them. */
async function resultsOf(deps: PeopleKnowledgeDeps, access: OwnerAccess, found: LineHit[]): Promise<KnowledgeSearchHitRow[]> {
  const byPage = new Map<string, { line: number; text: string }[]>()
  for (const h of found) {
    const lines = byPage.get(h.page) ?? []
    if (h.line !== undefined && h.text !== undefined) lines.push({ line: h.line, text: h.text })
    byPage.set(h.page, lines)
  }
  return Promise.all([...byPage].map(async ([page, lines], i) => {
    const facts = i < PAGES_TITLED_MAX ? await pageFacts(deps, access, page) : null
    // Without the page, a line of its front matter cannot be told from its text: show none rather than a raw line.
    const text = facts ? lines.filter(l => l.line >= facts.bodyLine) : []
    return {
      level: access.level, page, title: facts?.title || titleFromPageName(page),
      ...(facts?.description ? { description: facts.description } : {}),
      matches: text.slice(0, EXCERPT_LINES),
    }
  }))
}

async function askLevel(deps: PeopleKnowledgeDeps, access: OwnerAccess, pattern: string): Promise<LevelAnswer> {
  const work = deps.sites.grep(access.ref, { pattern, output_mode: 'content', '-i': true, '-n': true, head_limit: SEARCH_HITS_MAX }, deps.siteTimeLimitMs)
    .catch((err: unknown) => {
      deps.log.warn('knowledge search of a level failed', { ownerType: access.ref.ownerType, error: err instanceof Error ? err.name : 'unknown' })
      return null
    })
  const answer = await withDeadline(work, deps.siteTimeLimitMs)
  if (answer === 'timeout' || answer === null || !answer.ok) return { unanswered: true }
  if (answer.value.outcome === 'refused') return answer.value.message === NOT_FOUND ? { hits: [] } : { unanswered: true }
  return { hits: await resultsOf(deps, access, answer.value.hits.filter(h => !h.context)) }
}

export async function searchPages(
  deps: PeopleKnowledgeDeps, owner: KnowledgeOwner, input: { pattern: string; scope?: KnowledgeSearchScope }, userId: string,
): Promise<KnowledgeSearchAnswer> {
  const words = input.pattern.trim()
  if (words.length > SEARCH_WORDS_MAX) throw new KnowledgeRefusal(400, `A search is at most ${SEARCH_WORDS_MAX} characters. Use fewer words.`)
  const levels = await levelsOf(deps, owner, input.scope ?? 'both', userId)
  const named = levels.map(l => ({ level: l.level, name: l.name }))
  if (words === '') return { hits: [], levels: named, unanswered: [] }
  if (!limiter.take(`person:${userId}`)) throw new KnowledgeRefusal(429, 'That is a lot of searches at once. Wait a moment, then search again.')

  const pattern = literalPattern(words)
  const answers = await Promise.all(levels.map(l => askLevel(deps, l, pattern)))
  const hits: KnowledgeSearchHitRow[] = []
  const unanswered: string[] = []
  answers.forEach((a, i) => {
    if ('unanswered' in a) unanswered.push(levels[i].level)
    else hits.push(...a.hits)
  })
  return { hits, levels: named, unanswered }
}
