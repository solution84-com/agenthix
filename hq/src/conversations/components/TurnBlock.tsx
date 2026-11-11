import { useState } from 'react'
import { formatTime } from '@agenthix/ui/sessions'
import type { ConversationAgentView, ConversationMessageView, ReplyThinking } from '../../shared/conversations/protocol'
import { copyText, wordsOf, type TaskMessage, type TurnBlock, type WordsMessage } from '../hooks/threadBlocks'
import { AgentFrame } from './AgentFrame'
import { FailedCard, type SwitchOffer } from './FailedCard'
import { ReplyActions } from './ReplyActions'
import { ReplyBody, type ReplyView } from './ReplyBody'
import { ResultCard } from './ResultCard'
import { ScheduledCard } from './ScheduledCard'
import { TaskCard } from './TaskCard'
import { seconds, type ThinkingView } from './ThinkingPill'
import { cutLimit, useHeardCut } from '../voiceClient/heardCut'
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
export type LiveTurn = { thinking: ThinkingView; stream: { turnId: string; text: string; limit: number | null; target?: number | null } | null }

/** Where an answer the person stopped ends: who stopped it, and after how long when the turn kept it. */
export function stoppedWords(said: boolean, ms: number | null): string {
  if (!said) return 'You stopped it before it answered.'
  return ms === null ? 'You stopped it here.' : `You stopped it here, after ${seconds(ms)}.`
}

function Words({ message, reply, limit, target, thoughtMs, onTryAgain, offer }: {
  message: WordsMessage
  reply?: ReplyView
  /** How much of its text is laid out: to the sentence being revealed while voice speaks it, or what was heard since voice stopped it. */
  limit: number | null
  /** Where its reveal heads while voice speaks it; null for the end of what is laid out. */
  target: number | null
  thoughtMs: number | null
  onTryAgain?: () => void
  offer?: SwitchOffer | null
}) {
  const key = message.turnId ?? message.id
  if (message.kind === 'FAILED') {
    return <>
      {message.body.partialText && (
        <div className="max-w-[720px] text-reading">
          <ReplyBody text={message.body.partialText} replyKey={key} view={reply} writtenAt={message.createdAt} />
        </div>
      )}
      {message.body.partialText && <p className="text-small text-text-secondary" data-testid="answer-stopped">The answer stopped here.</p>}
      <FailedCard reason={message.body.reason} onTryAgain={onTryAgain} offer={offer} />
    </>
  }
  return <>
    {message.body.text.trim() && (
      <div className="max-w-[720px] text-reading">
        <ReplyBody text={message.body.text} limit={limit} target={target} replyKey={key} view={reply} writtenAt={message.createdAt} />
      </div>
    )}
    {message.interrupted && (
      <p className="text-small text-text-secondary" data-testid="stopped-here">{stoppedWords(!!message.body.text.trim(), thoughtMs)}</p>
    )}
  </>
}

/**
 * One turn of the agent's under one name line (walkthrough findings 31–34): the cards of what completed that it
 * answers, its words, the task it set for a time, the tasks it made, and, once the turn has ended, what can be done
 * with the answer (ReplyActions): Copy and the speaker when it said something, Try again when the person stopped it.
 */
export function TurnBlockView({ block, agent, work, reply, live, heldSince, onTryAgain, offer }: {
  block: Pick<TurnBlock, 'cards' | 'words' | 'set'> & { made?: TaskMessage[] }
  agent: ConversationAgentView | null
  work?: WorkContext
  reply?: ReplyView
  live?: LiveTurn
  /** When the turn began on this screen's clock, if it ran here: a reply held for its voice counts on from it. */
  heldSince?: number
  /** Sends again the person's message a stopped or failed turn answered; Try again shows only with it. */
  onTryAgain?: (turnId: string) => void
  /** On a failed turn: the one access the person may switch to. */
  offer?: SwitchOffer | null
}) {
  const [stepsOpen, setStepsOpen] = useState(false)
  const cut = useHeardCut()
  const limitOf = (w: WordsMessage) => w.kind !== 'TEXT' ? null
    : reply?.limitFor(w.turnId ?? undefined, w.body.text) ?? cutLimit(cut, w.turnId, w.body.text, w.interrupted)
  const targetOf = (w: WordsMessage) => w.kind !== 'TEXT' ? null : reply?.targetFor?.(w.turnId ?? undefined, w.body.text) ?? null
  // A reply being spoken shows nothing until its first words are heard.
  const heard = block.words.filter((w) => w.kind !== 'TEXT' || !w.body.text || limitOf(w) !== 0)
  // A finished reply waiting for its voice keeps its name line, still thinking, until its first words are heard.
  const held = !live && heard.length < block.words.length && !heard.some((w) => w.kind === 'TEXT' && w.body.text)
  const made = block.made ?? []
  if (!live && !held && heard.length === 0 && block.cards.length === 0 && block.set.length === 0 && made.length === 0) return null
  const first = block.words[0]
  const at = (first ?? block.cards[0] ?? block.set[0] ?? made[0])?.createdAt
  const settled = settledThinking(block.words)
  const thinking = live ? live.thinking
    : held ? { since: heldSince ?? new Date(at!).getTime() - (settled?.ms ?? 0), steps: settled?.steps ?? [] }
    : settled
  const stream = live?.stream
  const streamShown = stream ? (stream.limit === null ? stream.text : stream.text.slice(0, stream.limit)) : ''
  const said = wordsOf({ words: heard })
  const stopped = heard.some((w) => w.interrupted)
  const turnId = first?.turnId ?? null
  // The speaker reads the answer's own words: its last message that said something.
  const answer = [...heard].reverse().find((w) => w.kind === 'TEXT' && w.body.text.trim())
  // What can be done with the answer waits for its end: while voice is still revealing a reply, nothing shows under it.
  const revealing = heard.some((w) => {
    if (w.kind !== 'TEXT') return false
    const limit = limitOf(w), target = targetOf(w)
    return (limit !== null && limit < w.body.text.length) || (target !== null && target < w.body.text.length)
  })
  const showActions = !live && !revealing && (said.length > 0 || (stopped && !!onTryAgain && !!turnId))
  return (
    <AgentFrame
      agent={writerOf(first, agent, work)} meta={formatTime(at ?? new Date())} thinking={thinking} placePath={work?.placePath}
      open={stepsOpen} onToggle={() => setStepsOpen((o) => !o)}
    >
      {block.cards.map((c) => <ResultCard key={c.id} message={c} conversationId={work?.conversationId} />)}
      {heard.map((w) => <Words
        key={w.id} message={w} reply={reply} limit={limitOf(w)} target={targetOf(w)} thoughtMs={settled?.ms ?? null} offer={offer}
        onTryAgain={onTryAgain && w.turnId ? () => onTryAgain(w.turnId!) : undefined}
      />)}
      {stream && streamShown && (
        <div className="max-w-[720px] text-reading" data-testid="streaming-reply">
          <ReplyBody text={stream.text} limit={stream.limit} target={stream.target ?? null} replyKey={stream.turnId} view={reply} live />
          <span className="ml-0.5 inline-block h-[1em] w-[2px] bg-text-primary align-text-bottom motion-safe:animate-pulse" />
        </div>
      )}
      {block.set.map((s) => <ScheduledCard key={s.id} message={s} />)}
      {made.map((m) => <TaskCard key={m.id} body={m.body} />)}
      {showActions && (
        <ReplyActions
          text={copyText(said)}
          messageId={answer?.id}
          conversationId={work?.conversationId}
          turnId={turnId}
          onShowRun={thinking && thinking.steps.length > 0 ? () => setStepsOpen(true) : undefined}
          onTryAgain={stopped && onTryAgain && turnId ? () => onTryAgain(turnId) : undefined}
          onSaveToTask={work?.saveToTask}
        />
      )}
    </AgentFrame>
  )
}
