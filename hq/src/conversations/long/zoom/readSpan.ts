/**
 * `messages` (long conversations spec, Zooming in): the exact words of a segment's span, read from the record a
 * page at a time. A page holds about MESSAGES_PAGE_TOKENS; the result says what remains.
 */
import { MESSAGES_PAGE_TOKENS } from '../../../shared/conversations/protocol'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import { spanOf, wordsOf, type SegmentRecord } from './spans'

export type SpanMessage = { seq: number; at: string; from: 'person' | 'agent' | 'platform'; text: string }
export type MessagesPage = ReturnType<typeof spanOf> & {
  segment: string
  brief: string
  page: number
  pages: number
  messages: SpanMessage[]
  /** Messages of the span after this page. */
  remaining: number
  note?: string
}

const pageChars = MESSAGES_PAGE_TOKENS * 4

const fromOf = (role: ConversationMessageView['role']): SpanMessage['from'] =>
  role === 'PERSON' ? 'person' : role === 'AGENT' ? 'agent' : 'platform'

export function pageOfSpan(segment: SegmentRecord, record: readonly ConversationMessageView[], page: number): MessagesPage {
  const all: SpanMessage[] = []
  for (const m of record) {
    const text = wordsOf(m)
    if (text === null || text.trim() === '') continue
    all.push({ seq: m.seq, at: m.createdAt, from: fromOf(m.role), text })
  }
  // A message longer than a page is split across pages, so no page passes its size.
  const pages: SpanMessage[][] = [[]]
  let used = 0
  for (const m of all) {
    let text = m.text
    let first = true
    while (true) {
      const room = pageChars - used
      if (text.length <= room) {
        pages[pages.length - 1].push({ ...m, text: first ? text : `(continued) ${text}` })
        used += text.length
        break
      }
      if (room > 200) {
        pages[pages.length - 1].push({ ...m, text: `${first ? '' : '(continued) '}${text.slice(0, room)}` })
        text = text.slice(room)
        first = false
      }
      pages.push([])
      used = 0
    }
  }
  const total = pages.length
  const index = Math.min(Math.max(Math.trunc(page) || 1, 1), total)
  const messages = pages[index - 1]
  const remaining = pages.slice(index).reduce((n, p) => n + p.length, 0)
  return {
    segment: segment.id,
    brief: segment.brief,
    ...spanOf(segment),
    page: index,
    pages: total,
    messages,
    remaining,
    ...(page > total && { note: `The span has only ${total} page${total === 1 ? '' : 's'}; this is the last.` }),
    ...(index < total && { note: `${remaining} more message${remaining === 1 ? '' : 's'} on ${total - index} further page${total - index === 1 ? '' : 's'}: ask for page ${index + 1}.` }),
  }
}
