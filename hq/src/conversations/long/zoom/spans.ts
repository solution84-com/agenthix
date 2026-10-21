/** Text and sizes the zoom tools share: tokens are counted as about four characters each. */
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

export const tokensOf = (text: string): number => Math.ceil(text.length / 4)

export interface SegmentRecord {
  id: string
  firstSeq: number
  lastSeq: number
  firstAt: string
  lastAt: string
  brief: string
  summary: string
}

export const spanOf = (s: Pick<SegmentRecord, 'firstSeq' | 'lastSeq' | 'firstAt' | 'lastAt'>) => ({
  firstSeq: s.firstSeq, lastSeq: s.lastSeq, firstAt: s.firstAt, lastAt: s.lastAt,
})

/** What a message says in words, for reading a span back; null for a message that holds none (a card's frame). */
export function wordsOf(message: ConversationMessageView): string | null {
  switch (message.kind) {
    case 'TEXT': return message.body.text
    case 'NOTICE': return message.body.text
    case 'ACTION': return message.body.text
    case 'FAILED': return message.body.partialText ? `${message.body.partialText} [${message.body.reason}]` : message.body.reason
    case 'RESULT': return `${message.body.title}: ${message.body.summary}`
    case 'APPROVAL_REQUEST': return `${message.body.title}: ${message.body.reason}`
    case 'APPROVAL_ANSWER': return `${message.body.answer}${message.body.note ? `: ${message.body.note}` : ''}`
    case 'SUMMARISED': return message.body.brief
    case 'OPERATION_STARTED': return message.body.startsAt ? `Set to start ${message.body.startsAt}: ${message.body.title}` : `Started: ${message.body.title}`
    case 'TASK': return `${message.body.taskKey} ${message.body.title}`
    default: return null
  }
}
