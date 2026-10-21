/**
 * The probe's composed query (memory and knowledge spec, What decides a recall): "yes, do that" means nothing
 * alone, so the probe embeds the new message with the conversation's running topic line — its title, or its first
 * message — and the last two exchanges, a few hundred tokens in all. Nothing of it is stored.
 *
 * The new message comes first: the local embedding model reads at most 256 tokens and cuts the rest, so what
 * matters most must not be what is cut. The topic follows, then the exchanges, the latest first.
 */
import type { ConversationMessageView } from '../../shared/conversations/protocol'

/** About three hundred tokens: the local model's window, with a little to spare. */
export const COMPOSED_QUERY_MAX_CHARS = 1_200
const NEW_MESSAGE_MAX_CHARS = 600
const TOPIC_MAX_CHARS = 160
const EARLIER_MAX_CHARS = 200
/** Two exchanges: the person's message and the reply, twice. */
const EARLIER_MESSAGES = 4

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

/** What a message says, as the probe reads it: words people and the agent wrote, and what came back. */
function said(message: ConversationMessageView): string | null {
  switch (message.kind) {
    case 'TEXT': return message.body.text
    case 'RESULT': return `${message.body.title}: ${message.body.summary}`
    case 'APPROVAL_REQUEST': return `${message.body.title}: ${message.body.reason}`
    default: return null
  }
}

export function composeQuery(
  history: readonly ConversationMessageView[],
  inputIds: readonly string[],
  title: string | null,
): string {
  const ordered = [...history].sort((a, b) => a.seq - b.seq).filter(m => m.queueState !== 'CANCELLED')
  const inputs = ordered.filter(m => inputIds.includes(m.id))
  const firstInputSeq = inputs[0]?.seq ?? Number.POSITIVE_INFINITY

  const newText = clip(inputs.map(said).filter((t): t is string => !!t).join(' '), NEW_MESSAGE_MAX_CHARS)
  const firstPersonText = ordered.find(m => m.role === 'PERSON' && m.kind === 'TEXT' && !inputIds.includes(m.id))
  const topicSource = title?.trim() || (firstPersonText ? said(firstPersonText) : null)
  const topic = topicSource ? clip(topicSource, TOPIC_MAX_CHARS) : ''
  const earlier = ordered
    .filter(m => m.seq < firstInputSeq && (m.role === 'PERSON' || m.role === 'AGENT') && m.kind === 'TEXT')
    .slice(-EARLIER_MESSAGES)
    .reverse()
    .map(m => clip(said(m) ?? '', EARLIER_MAX_CHARS))
    .filter(t => t.length > 0 && t !== topic)

  return [newText, topic, ...earlier].filter(t => t.length > 0).join('\n').slice(0, COMPOSED_QUERY_MAX_CHARS)
}
