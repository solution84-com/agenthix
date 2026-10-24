/**
 * The thread's blocks, apart from React (walkthrough findings 31–34): each turn of the agent is one block under
 * one name line — the cards of what completed that the turn answers, its words, then the task it set for a time.
 * Work started and requests for the person's okay are in the work bar, not the thread, and so is the person's
 * answer to a request. A workflow run is in the bar while it runs and in the thread, where it ended, once finished.
 */
import type { ConversationMessageView } from '../../shared/conversations/protocol'
import type { ConversationRunCard } from '../../workflows/conversationRuns'
import { splitShownParts } from '../../shared/conversations/shownParts'
import { unseenWithdrawn } from '../../shared/conversations/withdrawn'

type Of<K extends ConversationMessageView['kind']> = Extract<ConversationMessageView, { kind: K }>
export type WordsMessage = Of<'TEXT'> | Of<'FAILED'>
export type ResultMessage = Of<'RESULT'>
export type StartedMessage = Of<'OPERATION_STARTED'>

/** One turn's block; `turnId` null for a card no turn answered. */
export type TurnBlock = {
  kind: 'turn'
  key: string
  turnId: string | null
  cards: ResultMessage[]
  words: WordsMessage[]
  /** Tasks the turn set for a time. */
  set: StartedMessage[]
}
export type ThreadItem = { kind: 'message'; message: ConversationMessageView } | { kind: 'run'; card: ConversationRunCard } | TurnBlock

const HIDDEN: ReadonlySet<ConversationMessageView['kind']> = new Set(['APPROVAL_REQUEST', 'APPROVAL_ANSWER'])

/** Which block a message belongs to; null for one drawn on its own. */
/** A task set for a time: its message holds when it starts. */
const isSet = (m: StartedMessage): boolean => !!m.body.startsAt

function blockKey(m: ConversationMessageView): string | null {
  if (m.kind === 'RESULT') return m.turnId ? `turn:${m.turnId}` : `card:${m.id}`
  if (m.role !== 'AGENT') return null
  if (m.kind === 'TEXT' || m.kind === 'FAILED') return m.turnId ? `turn:${m.turnId}` : `words:${m.id}`
  if (m.kind === 'OPERATION_STARTED' && m.turnId && isSet(m)) return `turn:${m.turnId}`
  return null
}

function shown(m: ConversationMessageView): boolean {
  if (HIDDEN.has(m.kind) || unseenWithdrawn(m)) return false
  // Started work is in the bar; only a task set for a time keeps its card, in its turn's block.
  if (m.kind === 'OPERATION_STARTED') return isSet(m)
  return true
}

/**
 * The thread's items, oldest first, and the running turn's block, drawn last where its words stream. A block
 * sits where its first words are — after any message the person sent while the card waited — or where its first
 * card is when it has no words. A finished workflow run sits after the last message from before it ended.
 */
export function threadItems(
  messages: ConversationMessageView[],
  { liveTurnId, runs = [] }: { liveTurnId: string | null; runs?: ConversationRunCard[] },
): { items: ThreadItem[]; live: TurnBlock | null } {
  const blocks = new Map<string, TurnBlock>()
  const firstAt = new Map<string, number>()
  const wordsAt = new Map<string, number>()
  const loose: Array<{ at: number; message: ConversationMessageView }> = []
  messages.forEach((m, at) => {
    if (!shown(m)) return
    const key = blockKey(m)
    if (!key) { loose.push({ at, message: m }); return }
    let block = blocks.get(key)
    if (!block) {
      block = { kind: 'turn', key, turnId: key.startsWith('turn:') ? m.turnId : null, cards: [], words: [], set: [] }
      blocks.set(key, block)
      firstAt.set(key, at)
    }
    if (m.kind === 'RESULT') block.cards.push(m)
    else if (m.kind === 'TEXT' || m.kind === 'FAILED') {
      block.words.push(m)
      if (!wordsAt.has(key)) wordsAt.set(key, at)
    } else if (m.kind === 'OPERATION_STARTED') block.set.push(m)
  })

  const liveKey = liveTurnId ? `turn:${liveTurnId}` : null
  const placed: Array<{ at: number; item: ThreadItem }> = loose.map(({ at, message }) => ({ at, item: { kind: 'message', message } }))
  for (const [key, block] of blocks) {
    if (key === liveKey) continue
    placed.push({ at: wordsAt.get(key) ?? firstAt.get(key)!, item: block })
  }
  // Oldest first, so runs that ended between the same two messages keep the order they ended in.
  const ended = runs.flatMap((card) => (card.endedAt ? [{ card, at: new Date(card.endedAt).getTime() }] : [])).sort((a, b) => a.at - b.at)
  ended.forEach(({ card, at }, i) => {
    const before = messages.filter((m) => Date.parse(m.createdAt) <= at).length
    placed.push({ at: before - 0.5 + i / (ended.length + 1) / 2, item: { kind: 'run', card } })
  })
  placed.sort((a, b) => a.at - b.at)
  const live = liveKey ? blocks.get(liveKey) ?? { kind: 'turn' as const, key: liveKey, turnId: liveTurnId, cards: [], words: [], set: [] } : null
  return { items: placed.map((p) => p.item), live }
}

/** What *Copy* takes of a block's words: the prose and what each shown part holds, without their markers. */
export function copyText(texts: string[]): string {
  return texts
    .flatMap((text) => splitShownParts(text).map((s) => (s.kind === 'prose' ? s.text.trim() : s.part.body.trim())))
    .filter(Boolean)
    .join('\n\n')
}

/** A block's words as text: the replies, and what a failed one had written before it failed. */
export function wordsOf(block: Pick<TurnBlock, 'words'>): string[] {
  return block.words.map((w) => (w.kind === 'TEXT' ? w.body.text : w.body.partialText ?? '')).filter((t) => t.trim() !== '')
}
