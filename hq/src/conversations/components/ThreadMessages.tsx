import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ConversationAgentView, ConversationMessageView } from '../../shared/conversations/protocol'
import type { ConversationRunCard } from '../../workflows/conversationRuns'
import type { LiveSteps, StreamState } from '../hooks/threadState'
import { failedTurnOf, threadItems, type TurnBlock } from '../hooks/threadBlocks'
import { MessageItem, PersonBubble } from './MessageItem'
import { LivePersonBubble } from './PersonWords'
import { sentKey, useLiveWords } from '../hooks/useLiveWords'
import type { ReplyView } from './ReplyBody'
import { TurnBlockView } from './TurnBlock'
import type { SwitchOffer } from './FailedCard'
import { useThreadFollow } from '../hooks/useThreadFollow'
import { JumpToLatest } from './JumpToLatest'
import { WorkflowRunCard } from './WorkflowRunRow'
import { ThreadRequestCard } from './approvals/ThreadRequestCard'
import type { WorkContext } from './WorkContext'
import { revealedText } from '../voiceClient/reveal'
import { cutLimit, useHeardCut } from '../voiceClient/heardCut'

/** How close to the top of the thread counts as scrolling up to older messages, in pixels. */
const NEAR_TOP = 120

/**
 * The thread: messages oldest to newest, older pages loaded as the person scrolls up (their place kept), each
 * turn of the agent's one block, the running turn's last with its words streaming in, messages waiting behind
 * it, and the work bar as the last thing in it. Finished workflow runs sit where they ended, and requests for the
 * person's okay where they were asked.
 */
export function ThreadMessages({ messages, waiting, stream, running, turnId, turnSince, steps, agent, hasMore, loadingOlder, onLoadOlder, busy, onSendNow, onCancel, work, reply, listening, runs = [], bar, onTryAgain, offer, floatingHeight = 0, floating }: {
  messages: ConversationMessageView[]
  waiting: ConversationMessageView[]
  stream: StreamState | null
  running: boolean
  /** The running turn, and when it began on this screen's clock. */
  turnId?: string | null
  turnSince?: number | null
  /** The running reply's steps, once it has taken one. */
  steps?: LiveSteps | null
  agent: ConversationAgentView | null
  hasMore: boolean
  loadingOlder: boolean
  onLoadOlder: () => void
  busy: boolean
  onSendNow: (messageId: string) => void
  onCancel: (messageId: string) => void
  work?: WorkContext
  reply?: ReplyView
  /** What the person is saying now, in voice mode, before it is sent. */
  listening?: string
  /** The finished workflow runs this conversation started. */
  runs?: ConversationRunCard[]
  /** The work bar, drawn last. */
  bar?: ReactNode
  /** Sends again the person's message the newest turn answered, when it failed or was stopped. */
  onTryAgain?: (turnId: string) => void
  /** When the newest turn failed: the one access the person may switch to. */
  offer?: SwitchOffer | null
  /** The height of the box floating over the thread's foot: the thread keeps that much room at its end, and a gap over it. */
  floatingHeight?: number
  /** The box floating over the thread's foot, so the line being read is held above where it actually is. */
  floating?: () => HTMLElement | null
}) {
  const box = useRef<HTMLDivElement>(null)
  // While voice speaks it, the streamed text is laid out to the sentence being revealed and revealed ahead of the voice.
  // Since voice stopped it, only as far as it was heard, until the record holds the cut.
  const cut = useHeardCut()
  const streamLimit = stream ? reply?.limitFor(stream.turnId, stream.text) ?? cutLimit(cut, stream.turnId, stream.text) : null
  const streamTarget = stream ? reply?.targetFor?.(stream.turnId, stream.text) ?? null : null
  const streamShown = stream ? revealedText(stream.text, streamLimit) : ''
  const liveTurnId = turnId ?? steps?.turnId ?? stream?.turnId ?? null
  // A run that ended before the oldest message loaded waits for its page, so it is never drawn out of order.
  const oldestAt = hasMore && messages[0] ? Date.parse(messages[0].createdAt) : -Infinity
  const shownRuns = runs.filter((r) => r.endedAt && new Date(r.endedAt).getTime() >= oldestAt)
  const { items, live: liveBlock } = threadItems(messages, { liveTurnId, runs: shownRuns })
  // A turn running before the screen knows its id is still drawn, as a block with only its pill.
  const live: Pick<TurnBlock, 'cards' | 'words' | 'set'> | null = liveBlock ?? (running || stream ? { cards: [], words: [], set: [] } : null)
  const liveSteps = steps && (!liveTurnId || steps.turnId === liveTurnId) ? steps : null
  const fallbackSince = useMemo(() => Date.now(), [liveTurnId, running])
  const liveSince = turnSince ?? fallbackSince
  // When each turn that ran here began, so a reply held for its voice after it ends keeps counting from it.
  const sinceOf = useRef(new Map<string, number>())
  if (live && liveTurnId && !sinceOf.current.has(liveTurnId)) sinceOf.current.set(liveTurnId, liveSince)
  const inner = useRef<HTMLDivElement>(null)
  const heightBefore = useRef<number | null>(null)
  // The newest message the person sent, waiting or not: once it is in the thread, it is held at the top for the reply to
  // be written under, even if they had scrolled away.
  const sent = [...messages, ...waiting].reverse().find((m) => m.role === 'PERSON')?.id ?? null
  const follow = useThreadFollow({ box, inner, floating, floatingHeight, replying: running || stream !== null, voice: !!reply?.inVoice, sent })
  // What the person is saying, in their bubble, kept once sent until their message lands in its place.
  const newestOfTheirs = [...messages, ...waiting].reverse().find((m) => m.role === 'PERSON' && m.kind === 'TEXT')
  const said = useLiveWords(listening, sentKey(newestOfTheirs && { id: newestOfTheirs.id, text: newestOfTheirs.kind === 'TEXT' ? newestOfTheirs.body.text : '' }))

  // Not following: the round ↓ shows, with a dot once a new answer has arrived since.
  const [arrived, setArrived] = useState(false)
  const newestAnswer = messages.reduce((n, m) => (m.role === 'AGENT' && (m.kind === 'TEXT' || m.kind === 'FAILED') ? Math.max(n, m.seq) : n), 0)
  const seenAnswer = useRef(newestAnswer)
  useEffect(() => {
    if (newestAnswer === seenAnswer.current) return
    if (!follow.following) setArrived(true)
    else seenAnswer.current = newestAnswer
  }, [newestAnswer])
  useEffect(() => {
    if (!follow.following) return
    seenAnswer.current = newestAnswer
    setArrived(false)
  }, [follow.following])

  const onScroll = () => {
    const el = box.current
    if (!el) return
    follow.scrolled()
    if (el.scrollTop < NEAR_TOP && hasMore && !loadingOlder) {
      heightBefore.current = el.scrollHeight
      onLoadOlder()
    }
  }

  // Older messages arrive above the ones being read: keep the same message under the eye. New ones are followed.
  const oldestId = messages[0]?.id
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    if (heightBefore.current !== null) {
      el.scrollTop += el.scrollHeight - heightBefore.current
      heightBefore.current = null
    }
    follow.wake()
  }, [oldestId, messages.length, waiting.length, streamShown, said?.text, running, steps?.steps.length, floatingHeight])

  // A thread that fits the screen has nothing to scroll: fetch further back until it fills.
  useEffect(() => {
    const el = box.current
    if (el && hasMore && !loadingOlder && el.scrollHeight <= el.clientHeight) onLoadOlder()
  }, [hasMore, loadingOlder, messages.length])

  const failedTurn = failedTurnOf(messages)
  const lastTurnKey = [...items].reverse().find((i) => i.kind === 'turn')?.key
  const noMoreBefore = !hasMore && messages.length > 0

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
    <div ref={box} onScroll={onScroll} className="thread-scroll min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]" data-testid="thread-messages">
      {/* Its bottom padding, the room under the last line, is the follow's to write (useThreadFollow). */}
      <div ref={inner} data-testid="thread-end-space" className="mx-auto w-full max-w-[720px] space-y-5 px-4 pt-5">
        {hasMore && (
          <div className="text-center">
            <button type="button" onClick={onLoadOlder} disabled={loadingOlder} className="text-small text-text-secondary not-disabled:hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 max-lg:min-h-10">
              {loadingOlder ? 'Loading earlier messages…' : 'Show earlier messages'}
            </button>
          </div>
        )}
        {noMoreBefore && <p data-testid="conversation-start" className="text-center text-micro text-text-muted">Start of the conversation</p>}
        {items.map((item) => item.kind === 'message'
          ? <MessageItem key={item.message.id} message={item.message} agent={agent} work={work} reply={reply} />
          : item.kind === 'run'
          ? <WorkflowRunCard key={`run:${item.card.runId}`} card={item.card} />
          : item.kind === 'request'
          ? <ThreadRequestCard key={item.message.id} item={item} />
          : (
            <div key={item.key} data-turn>
              <TurnBlockView
                block={item} agent={agent} work={work} reply={reply} heldSince={item.turnId ? sinceOf.current.get(item.turnId) : undefined}
                onTryAgain={item.key === lastTurnKey && !live ? onTryAgain : undefined}
                offer={item.key === lastTurnKey && failedTurn !== null && !live ? offer : undefined}
              />
            </div>
          ))}
        {live && (
          <div data-turn>
            <TurnBlockView
              block={live}
              agent={agent}
              work={work}
              reply={reply}
              live={{ thinking: liveSteps ?? { since: liveSince, steps: [] }, stream: stream ? { ...stream, limit: streamLimit, target: streamTarget } : null }}
            />
          </div>
        )}
        {said && <LivePersonBubble text={said.text} since={said.since} />}
        {waiting.map((m) => m.kind === 'TEXT' && (
          <PersonBubble key={m.id} message={m} waiting busy={busy} onSendNow={() => onSendNow(m.id)} onCancel={() => onCancel(m.id)} />
        ))}
        {bar}
      </div>
    </div>
    {(!follow.following || follow.below) && (
      <JumpToLatest arrived={arrived} onJump={follow.followAgain} lift={floatingHeight} writing={follow.below && (running || stream !== null)} />
    )}
    </div>
  )
}
