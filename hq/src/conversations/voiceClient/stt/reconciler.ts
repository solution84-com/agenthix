/**
 * STT's reconciler (adaptive voice spec, STT): the words of every speech connection, one after another, made into
 * one stream of `stt.words`, provisional and committed told apart. Each of the person's turns has one `order`
 * across connections; once a turn is committed, it never changes.
 *
 * When a connection is replaced, the new one is given the audio from the start of the last word the old one heard,
 * and the two are lined up by time: the turn being heard carries on under the same order, with the old connection's
 * words before that point and the new one's after it. Words the new one hears again (before that point, or before
 * anything committed) are left out.
 */
import type { TimedWord } from '../events'

export type HeardWords = {
  text: string
  /** On the capture clock; empty when the service did not time them. */
  words: TimedWord[]
  committed: boolean
  /** The service's own turn number on this connection. */
  turn: number | null
}

export type WordsOut = { text: string; words: TimedWord[]; committed: boolean; order: number }

type Open = {
  order: number
  /** The connection and its turn this is heard on; null once carried over, until the next connection claims it. */
  conn: number | null
  turn: number | null
  /** Words from earlier connections. */
  carried: TimedWord[]
  carriedText: string
  /** Once carried over: where the next connection's words begin to count. */
  resumeAt: number | null
  /** Everything shown for it last. */
  words: TimedWord[]
  text: string
}

export type ReconcilerState = {
  nextOrder: number
  /** The end of the last committed word. */
  committedUntil: number
  /** Where each connection's words begin to count. */
  floors: Readonly<Record<number, number>>
  open: Open | null
  /** Turns already finished, as `conn:turn`; anything more from them is ignored. */
  closed: readonly string[]
  /** The end of the last word heard on any connection. */
  heardUntil: number
}

export const NO_WORDS: ReconcilerState = {
  nextOrder: 0, committedUntil: -Infinity, floors: {}, open: null, closed: [], heardUntil: -Infinity,
}

const CLOSED_KEPT = 50
const keyOf = (conn: number, turn: number | null) => `${conn}:${turn ?? '-'}`
const midOf = (w: TimedWord) => (w.startAt + w.endAt) / 2
const lastEnd = (words: readonly TimedWord[]) => words.reduce((at, w) => Math.max(at, w.endAt), -Infinity)
const joinText = (...parts: string[]) => parts.map(p => p.trim()).filter(Boolean).join(' ')

type Step = { state: ReconcilerState; emit: WordsOut[] }

const close = (state: ReconcilerState, key: string): ReconcilerState =>
  ({ ...state, closed: [...state.closed, key].slice(-CLOSED_KEPT) })

function commitOpen(state: ReconcilerState, keepTurn = false): Step {
  const open = state.open
  if (!open) return { state, emit: [] }
  const closed = open.conn === null || keepTurn ? state : close(state, keyOf(open.conn, open.turn))
  return {
    state: { ...closed, open: null, committedUntil: Math.max(state.committedUntil, lastEnd(open.words)) },
    emit: [{ text: open.text, words: open.words, committed: true, order: open.order }],
  }
}

/** A connection's words begin to count from `at`. */
export function begin(state: ReconcilerState, conn: number, at: number): ReconcilerState {
  return { ...state, floors: { ...state.floors, [conn]: at } }
}

/** Words from connection `conn`. */
export function heard(state: ReconcilerState, conn: number, msg: HeardWords): Step {
  const key = keyOf(conn, msg.turn)
  if (state.closed.includes(key)) return { state, emit: [] }
  const emit: WordsOut[] = []
  let s = state
  let open = s.open
  if (open && open.conn === conn && open.turn !== msg.turn) {
    // A new turn on the same connection while the last was never committed: the last is finished as it stands.
    const done = commitOpen(s)
    s = done.state; emit.push(...done.emit); open = null
  }
  if (open && open.conn === null) open = { ...open, conn, turn: msg.turn, resumeAt: null }
  if (!open || open.conn !== conn) {
    open = { order: s.nextOrder, conn, turn: msg.turn, carried: [], carriedText: '', resumeAt: null, words: [], text: '' }
    s = { ...s, nextOrder: s.nextOrder + 1 }
  }

  const floor = Math.max(s.committedUntil, s.floors[conn] ?? -Infinity)
  const timed = msg.words.length > 0
  const kept = timed ? msg.words.filter(w => midOf(w) > floor) : []
  const words = [...open.carried, ...kept]
  const text = !timed ? joinText(open.carriedText, msg.text)
    : !open.carried.length && kept.length === msg.words.length ? msg.text.trim()
      : joinText(open.carriedText, kept.map(w => w.text).join(' '))
  const shownBefore = open.text !== '' || open.words.length > 0
  s = { ...s, heardUntil: Math.max(s.heardUntil, lastEnd(kept)) }

  if (text === '' && !shownBefore) {
    return { state: msg.committed ? { ...close(s, key), open: null } : { ...s, open }, emit }
  }
  open = { ...open, words, text }
  if (!msg.committed) return { state: { ...s, open }, emit: [...emit, { text, words, committed: false, order: open.order }] }
  const done = commitOpen({ ...s, open })
  return { state: done.state, emit: [...emit, ...done.emit] }
}

/**
 * The person's message was sent while connection `conn` stays: the turn ends as heard, and the service's later words,
 * even of the same turn of its own, begin a new one after what was committed.
 */
export function settle(state: ReconcilerState, conn: number): Step {
  const open = state.open
  if (!open || (open.conn !== conn && open.conn !== null)) return { state, emit: [] }
  return commitOpen(state, true)
}

/**
 * Connection `conn` is being replaced. `carry`: the turn being heard carries on, and the next connection is heard
 * from the start of its last word; `commit`: the turn ends as heard (the person's message was sent), and the next
 * connection is heard from its end. Returns where the next connection's words begin to count.
 */
export function cut(state: ReconcilerState, conn: number, mode: 'carry' | 'commit'): Step & { from: number } {
  const open = state.open
  if (!open || (open.conn !== conn && open.conn !== null)) {
    return { state, emit: [], from: Math.max(state.heardUntil, state.committedUntil) }
  }
  if (mode === 'commit') {
    const done = commitOpen(state)
    return { ...done, from: Math.max(done.state.committedUntil, state.heardUntil) }
  }
  // Replaced again before the next connection heard anything: it is heard from the same point.
  if (open.conn === null) return { state, emit: [], from: resumePoint(state) }
  const last = open.words[open.words.length - 1]
  const carried = last ? open.words.slice(0, -1) : open.carried
  const from = last ? last.startAt : Math.max(state.heardUntil, state.committedUntil)
  const base = close(state, keyOf(open.conn, open.turn))
  const carriedText = last ? joinText(...carried.map(w => w.text)) : open.carriedText
  return {
    state: { ...base, open: { ...open, conn: null, turn: null, carried, carriedText, resumeAt: from } },
    emit: [],
    from,
  }
}

/** Where a replacement would hear from, were it now: audio before this need not be kept. */
export function resumePoint(state: ReconcilerState): number {
  if (state.open?.resumeAt != null) return state.open.resumeAt
  const last = state.open?.words[state.open.words.length - 1]
  return last ? last.startAt : Math.max(state.heardUntil, state.committedUntil)
}
