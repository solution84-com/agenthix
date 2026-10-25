/**
 * `search_knowledge` (K1, D1–D3): one search over every level the caller may see — its places, the organisation and
 * the platform guide — asked of each at once and merged within one time limit. `scope` narrows to one level; a site
 * that cannot answer says so in the result while the rest still answers (S8). The pattern is a model's and is never
 * trusted: it goes to the file tools' Grep (on the sites, and here for the guide) and to nothing else, and it is
 * never logged (S7).
 */
import type { KnowledgeGrepHit, KnowledgeGrepParams } from '@agenthix/core'
import { GREP_LIMITS, GrepRateLimiter, grepRefusalMessage, refusalMessage, type GrepFound } from '@agenthix/core/file-tools'
import type { KnowledgeDeps, SiteFailure } from './deps'
import { withDeadline } from './deadline'
import { levelSearchNote, MESSAGES } from './messages'
import { outlineLevels } from './searchOutline'
import { mergeSearch, type LevelOutcome, type SearchMode } from './searchFormat'
import { parseToolParams } from './params'
import { platformGuideNotice, platformNameOfFile } from './platformGuide'
import { levelNames, levelsOf, resolveLevel, splitName, type KnowledgeReach, type Level } from './reach'
import { tellSearch } from './steps'

type Params = {
  pattern: string
  scope?: string
  path?: string
  glob?: string
  output_mode?: SearchMode
  '-i'?: boolean
  '-n'?: boolean
  '-A'?: number
  '-B'?: number
  '-C'?: number
  head_limit?: number
  offset?: number
}

/** A level's answer before merging: hits, a refusal of the search itself (shared by every level), or why none. */
type Answer = { hits: KnowledgeGrepHit[] } | { refused: string } | { failed: SiteFailure | 'timeout' } | { note: string }

const NOT_FOUND = refusalMessage('not-found')

function hitsOfFound(found: GrepFound): KnowledgeGrepHit[] {
  if (found.mode === 'files_with_matches') return found.filenames.map(f => ({ page: platformNameOfFile(f) }))
  if (found.mode === 'count') return found.counts.map(c => ({ page: platformNameOfFile(c.file), count: c.count }))
  const hits: KnowledgeGrepHit[] = []
  for (const l of found.lines) {
    if (l.kind === 'break') continue
    if (l.kind === 'binary') {
      hits.push({ page: platformNameOfFile(l.file), text: l.text })
      continue
    }
    hits.push({
      page: platformNameOfFile(l.file),
      ...(found.showLineNumbers ? { line: l.line } : {}),
      text: l.text,
      ...(l.kind === 'context' ? { context: true as const } : {}),
    })
  }
  return hits
}

/** A section or page of the guide by the guide's own name, as its built folder holds it. */
function guidePath(p: string): string {
  return p === 'tools.md' || p === 'glossary.md' ? p : `pages/${p}`
}

async function askLevel(deps: KnowledgeDeps, reach: KnowledgeReach, level: Level, params: KnowledgeGrepParams): Promise<Answer> {
  if (level.kind === 'platform') {
    const glob = params.glob && params.glob.includes('/') && !params.glob.startsWith('**') ? `pages/${params.glob}` : params.glob
    const answer = await deps.guide.grep({ ...params, path: params.path ? guidePath(params.path) : undefined, glob }, reach.callerKey)
    if (answer.ok) return { hits: hitsOfFound(answer.found) }
    return answer.missing ? { note: `[platform: ${answer.message}]` } : { refused: answer.message }
  }
  const answer = await deps.sites.grep(level.owner, params, deps.searchTimeLimitMs)
  if (!answer.ok) return { failed: answer.why }
  if (answer.value.outcome === 'refused') return { refused: answer.value.message }
  return { hits: answer.value.hits }
}

const limiter = new GrepRateLimiter()

/** A search refused before it reached any level is still a step of the conversation: one that covered nothing. */
function searchedNothing(reach: KnowledgeReach, answer: string): string {
  tellSearch(reach, [])
  return answer
}

export async function searchKnowledgeIn(deps: KnowledgeDeps, reach: KnowledgeReach, input: unknown): Promise<string> {
  const parsed = parseToolParams('search_knowledge', input)
  if (!parsed.ok) {
    const tooLong = parsed.parameter === 'pattern' && typeof (input as { pattern?: unknown })?.pattern === 'string'
    return searchedNothing(reach, tooLong ? grepRefusalMessage('pattern-too-long') : grepRefusalMessage('invalid-parameter', parsed.parameter as 'pattern'))
  }
  const p = parsed.value as Params
  if (!limiter.take(reach.callerKey)) return searchedNothing(reach, grepRefusalMessage('rate-limited'))

  // A path may carry its level (`website-rebuild:processes`), as hits are marked: that is the scope.
  let scope = p.scope
  let path = p.path
  const pathLevel = path ? splitName(path) : null
  if (pathLevel) {
    if (scope !== undefined && scope !== pathLevel.level) return searchedNothing(reach, MESSAGES.invalidParameter('path'))
    scope = pathLevel.level
    path = pathLevel.rest || undefined
  }
  let levels = levelsOf(reach)
  if (scope !== undefined) {
    const level = resolveLevel(reach, scope.endsWith(':') ? scope.slice(0, -1) : scope)
    if (!level) {
      const held = levelsOf(reach).map(l => l.name)
      return searchedNothing(reach, reach.agent?.conversationId ? MESSAGES.searchNotInConversation(scope, held) : MESSAGES.notInReach(levelNames(reach)))
    }
    levels = [level]
  }

  tellSearch(reach, levels)
  if (p.pattern.trim() === '') return outlineLevels(deps, levels)

  const mode = p.output_mode ?? 'content'
  const offset = p.offset ?? 0
  const limit = p.head_limit ?? GREP_LIMITS.defaultHeadLimit
  // Each level from its start, far enough that the merged window is whole, and one more to tell whether there is more.
  const grep: KnowledgeGrepParams = {
    pattern: p.pattern,
    ...(path !== undefined ? { path } : {}),
    ...(p.glob !== undefined ? { glob: p.glob } : {}),
    output_mode: mode,
    '-i': p['-i'] ?? true,
    '-n': p['-n'] ?? true,
    ...(p['-A'] !== undefined ? { '-A': p['-A'] } : {}),
    ...(p['-B'] !== undefined ? { '-B': p['-B'] } : {}),
    ...(p['-C'] !== undefined ? { '-C': p['-C'] } : {}),
    head_limit: offset + limit + 1,
    offset: 0,
  }

  const answers = await Promise.all(levels.map(async level => {
    const answer = await withDeadline(
      askLevel(deps, reach, level, grep).catch((err: unknown): Answer => {
        deps.log.warn('knowledge search of a level failed', { level: level.kind, error: err instanceof Error ? err.name : 'unknown' })
        return { failed: 'failed' }
      }),
      deps.searchTimeLimitMs,
    )
    return { level, answer: answer === 'timeout' ? ({ failed: 'timeout' } as Answer) : answer }
  }))

  const refusals = answers.flatMap(a => ('refused' in a.answer ? [a.answer.refused] : []))
  const answered = answers.filter(a => 'hits' in a.answer)
  // The pattern is the same everywhere: a refusal of it (too slow, not valid) is the answer when nothing else found any.
  const meaningful = refusals.filter(m => m !== NOT_FOUND)
  if (meaningful.length && !answered.some(a => 'hits' in a.answer && a.answer.hits.length)) return meaningful[0]
  if (refusals.length === answers.length && refusals.every(m => m === NOT_FOUND)) return NOT_FOUND

  const outcomes: LevelOutcome[] = []
  for (const { level, answer } of answers) {
    if ('hits' in answer) outcomes.push({ level: level.name, hits: answer.hits })
    else if ('note' in answer) outcomes.push({ level: level.name, note: answer.note })
    else if ('failed' in answer) outcomes.push({ level: level.name, note: levelSearchNote(level.name, answer.failed) })
    // A path a level does not have is that level having nothing there.
    else if (answer.refused === NOT_FOUND) outcomes.push({ level: level.name, hits: [] })
    else outcomes.push({ level: level.name, note: `[${level.name}: ${answer.refused}]` })
  }
  return mergeSearch({ mode, outcomes, offset, limit, platformNotice: platformGuideNotice(), inConversation: !!reach.agent?.conversationId })
}
