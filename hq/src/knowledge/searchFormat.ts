/**
 * The answers of every level merged into one, as Grep gives it, each hit marked with where it is from (D2): in
 * `content` mode `level:page:line: text` (a line around a match `level:page-line- text`), in `files_with_matches`
 * `level:page`, in `count` `level:page:N`. Levels come in the order given — the places, the organisation, the guide
 * (D3) — and `offset` and `head_limit` count across them all. The answer is held to 8,000 characters (K1, S5),
 * saying where to continue.
 */
import type { KnowledgeGrepHit, KnowledgeSearchHit } from '@agenthix/core'
import { KNOWLEDGE_SEARCH_MAX_CHARS } from '../server/controlplane/knowledgeToolSchemas'
import { levelsInWords } from './messages'

export type SearchMode = 'content' | 'files_with_matches' | 'count'

/** What one level answered: its hits, or a line saying why it has none (a site down, the guide missing). */
export type LevelOutcome = { level: string; hits: KnowledgeGrepHit[] } | { level: string; note: string }

export interface MergeInput {
  mode: SearchMode
  outcomes: LevelOutcome[]
  offset: number
  limit: number
  /** Put before the first `platform:` hit: what the guide is about, and that the caller's tools decide (limits.md). */
  platformNotice: string
  /** A conversation's search: when nothing matched, it says a place not in the conversation was not searched. */
  inConversation?: boolean
}

/** Room kept under the cap for the line saying where to continue. */
const NOTE_ROOM = 200

function hitLine(h: KnowledgeSearchHit, mode: SearchMode): string {
  const name = `${h.level}:${h.page}`
  if (mode === 'files_with_matches') return name
  if (mode === 'count') return `${name}:${h.count ?? 0}`
  const sep = h.context ? '-' : ':'
  return h.line !== undefined ? `${name}${sep}${h.line}${sep} ${h.text ?? ''}` : `${name}${sep} ${h.text ?? ''}`
}

function summary(mode: SearchMode, shown: KnowledgeSearchHit[]): string | null {
  if (mode === 'count') {
    const total = shown.reduce((n, h) => n + (h.count ?? 0), 0)
    return `Found ${total} total ${total === 1 ? 'occurrence' : 'occurrences'} across ${shown.length} ${shown.length === 1 ? 'page' : 'pages'}.`
  }
  if (mode === 'files_with_matches') return `Found ${shown.length} ${shown.length === 1 ? 'page' : 'pages'}`
  return null
}

export function mergeSearch(input: MergeInput): string {
  const notes: string[] = []
  const all: KnowledgeSearchHit[] = []
  for (const o of input.outcomes) {
    if ('note' in o) notes.push(o.note)
    else for (const h of o.hits) all.push({ ...h, level: o.level })
  }
  const end = input.offset + input.limit
  const window = all.slice(input.offset, end)
  const moreAfterLimit = all.length > end

  // Every answer names the levels it searched (F10); one whose site did not answer is in a note instead.
  const searched = input.outcomes.filter(o => 'hits' in o).map(o => o.level)
  const searchedLine = `[Searched ${levelsInWords(searched, 'and')}.]`
  const lines: string[] = []
  let used = notes.reduce((n, l) => n + l.length + 1, searchedLine.length + 1)
  let shown = 0
  let cut = false
  let noticed = false
  for (const h of window) {
    const extra: string[] = []
    if (h.level === 'platform' && !noticed) extra.push(`[platform: ${input.platformNotice}]`)
    extra.push(hitLine(h, input.mode))
    const size = extra.reduce((n, l) => n + l.length + 1, 0)
    if (used + size > KNOWLEDGE_SEARCH_MAX_CHARS - NOTE_ROOM) {
      cut = true
      break
    }
    if (h.level === 'platform') noticed = true
    lines.push(...extra)
    used += size
    shown++
  }

  const body: string[] = [...notes]
  const head = summary(input.mode, window.slice(0, shown))
  if (shown === 0 && !cut) {
    if (input.offset > 0 && all.length > 0) {
      body.push('No entries at this offset', searchedLine)
      return body.join('\n')
    }
    const none = input.mode === 'content' ? 'No matches found' : 'No pages found'
    body.push(searched.length ? `${none}: nothing in ${levelsInWords(searched, 'or')}.` : none)
    if (input.inConversation) body.push('[A place not in this conversation was not searched: that is not the same as it being empty. suggest_place offers it to the person.]')
    return body.join('\n')
  }
  if (head && input.mode === 'files_with_matches') body.push(head)
  body.push(...lines)
  if (head && input.mode === 'count') body.push(head)
  body.push(searchedLine)
  const next = input.offset + shown
  if (cut) {
    body.push(`[Cut at ${KNOWLEDGE_SEARCH_MAX_CHARS.toLocaleString('en')} characters: showing ${shown} from offset ${input.offset}. Continue with offset ${next}, or narrow with scope, path or glob.]`)
  } else if (moreAfterLimit) {
    body.push(`[Showing results with pagination = limit: ${input.limit}, offset: ${input.offset}. Continue with offset ${next}.]`)
  }
  return body.join('\n')
}
