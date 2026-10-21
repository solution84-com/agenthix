import { formatTime } from '@agenthix/ui/sessions'
import type { ConversationAgentView, ConversationMessageView, ReplyThinking } from '../../shared/conversations/protocol'
import { copyText, wordsOf, type TurnBlock, type WordsMessage } from '../hooks/threadBlocks'
import { AgentFrame } from './AgentFrame'
import { FailedCard } from './FailedCard'
import { ReplyActions } from './ReplyActions'
import { ReplyBody, type ReplyView } from './ReplyBody'
import { ResultCard } from './ResultCard'
import { ScheduledCard } from './ScheduledCard'
import type { ThinkingView } from './ThinkingPill'
import type { WorkContext } from './WorkContext'

/** The agent that wrote a reply: in a task's thread it may not be the one the task has now. */
export function writerOf(message: ConversationMessageView | undefined, agent: ConversationAgentView | null, work?: WorkContext): ConversationAgentView | null {
  return (message?.agentId && work?.agentsById?.[message.agentId]) || agent
}

/** The turn's pill: the last of its replies that kept how long it thought. */
function settledThinking(words: WordsMessage[]): ReplyThinking | null {
  for (let i = words.length - 1; i >= 0; i--) {
    const thinking = words[i]!.body.thinking
    if (thinking) return thinking
  }
  return null
}

/** The running turn: its pill counting, and the words it streams so far — `shown` of them while voice speaks them. */
export type LiveTurn = { thinking: ThinkingView; stream: { turnId: string; text: string; limit: number | null } | null }

function Words({ message, reply }: { message: WordsMessage; reply?: ReplyView }) {
  const key = message.turnId ?? message.id
  if (message.kind === 'FAILED') {
    return <>
      {message.body.partialText && (
        <div className="max-w-[720px] text-reading">
          <ReplyBody text={message.body.partialText} replyKey={key} view={reply} />
        </div>
      )}
      <FailedCard reason={message.body.reason} />
    </>
  }
  const limit = reply?.limitFor(message.turnId ?? undefined, message.body.text) ?? null
  return <>
    {message.body.text.trim() && (
      <div className="max-w-[720px] text-reading">
        <ReplyBody text={message.body.text} limit={limit} replyKey={key} view={reply} />
      </div>
    )}
    {message.interrupted && (
      <p className="text-micro text-text-muted">{message.body.text.trim() ? 'Stopped here when you spoke or wrote again' : 'Stopped'}</p>
    )}
  </>
}

/**
 * One turn of the agent's under one name line (walkthrough findings 31–34): the cards of what completed that it
 * answers, its words, the task it set for a time, and — once the turn has ended and it said something — Copy.
 */
export function TurnBlockView({ block, agent, work, reply, live, heldSince }: {
  block: Pick<TurnBlock, 'cards' | 'words' | 'set'>
  agent: ConversationAgentView | null
  work?: WorkContext
  reply?: ReplyView
  live?: LiveTurn
  /** When the turn began on this screen's clock, if it ran here: a reply held for its voice counts on from it. */
  heldSince?: number
}) {
  // A reply being spoken shows nothing until its first words are heard.
  const heard = block.words.filter((w) => w.kind !== 'TEXT' || !w.body.text || reply?.limitFor(w.turnId ?? undefined, w.body.text) !== 0)
  // A finished reply waiting for its voice keeps its name line, still thinking, until its first words are heard.
  const held = !live && heard.length < block.words.length && !heard.some((w) => w.kind === 'TEXT' && w.body.text)
  if (!live && !held && heard.length === 0 && block.cards.length === 0 && block.set.length === 0) return null
  const first = block.words[0]
  const at = (first ?? block.cards[0] ?? block.set[0])?.createdAt
  const settled = settledThinking(block.words)
  const thinking = live ? live.thinking
    : held ? { since: heldSince ?? new Date(at!).getTime() - (settled?.ms ?? 0), steps: settled?.steps ?? [] }
    : settled
  const stream = live?.stream
  const streamShown = stream ? (stream.limit === null ? stream.text : stream.text.slice(0, stream.limit)) : ''
  const said = wordsOf({ words: heard })
  return (
    <AgentFrame agent={writerOf(first, agent, work)} meta={formatTime(at ?? new Date())} thinking={thinking}>
      {block.cards.map((c) => <ResultCard key={c.id} message={c} conversationId={work?.conversationId} />)}
      {heard.map((w) => <Words key={w.id} message={w} reply={reply} />)}
      {stream && streamShown && (
        <div className="max-w-[720px] text-reading" data-testid="streaming-reply">
          <ReplyBody text={stream.text} limit={stream.limit} replyKey={stream.turnId} view={reply} />
          <span className="ml-0.5 inline-block h-[1em] w-[2px] bg-accent align-text-bottom motion-safe:animate-pulse" />
        </div>
      )}
      {block.set.map((s) => <ScheduledCard key={s.id} message={s} />)}
      {!live && said.length > 0 && <ReplyActions text={copyText(said)} />}
    </AgentFrame>
  )
}
