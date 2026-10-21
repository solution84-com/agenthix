import type { Clock } from '../../clock'
import type { ServiceWord, SpeechToText, SpeechToTextConnection, SpeechToTextHandlers } from '../../ports'

const PUMP_MS = 10

type Mode = { rate: number }

/**
 * A speech service that can be told to misbehave. Audio sent is counted as arrived at once; how fast the service
 * takes it is a rate (1 = as fast as it is spoken, which leaves no backlog; below 1 = slow; 0 = stalled), and
 * what it has not taken is `bufferedMs`. Words are the ones the test scripts with `say`.
 */
export type FakeSpeechToText = SpeechToText & {
  /** Takes audio at `rate` times real time (below 1 builds a backlog). */
  slow: (rate: number) => void
  /** Takes no audio and sends no words until `resume` or `burst`. */
  stall: () => void
  /** Takes audio at `rate` again (1 = real time); words held while stalled go out. */
  resume: (rate?: number) => void
  /** Takes everything waiting at once, then keeps up. */
  burst: () => void
  /** Closes the current connection as the service would: `onClose`. */
  drop: (reason?: string) => void
  /** Reports an error on the current connection. */
  error: (message: string) => void
  /** Words sent this long after `say`. */
  delayWordsBy: (ms: number) => void
  /** The next `connect` fails with this message. */
  failNextConnect: (message: string) => void
  /** The service sends words (held while stalled, delayed by `delayWordsBy`). */
  say: (text: string, words: ServiceWord[], committed: boolean, order?: number | null) => void
  connections: () => number
  /** Audio the service has taken, in ms, over every connection. */
  takenMs: () => number
  /** Every chunk handed to `send`: when, and how long. */
  received: () => ReadonlyArray<{ t: number; ms: number }>
  /** How many times a turn was ended on request. */
  endTurns: () => number
  /** Sends after the connection was closed or dropped (audio that went nowhere). */
  lostSends: () => number
}

export function fakeSpeechToText(clock: Clock): FakeSpeechToText {
  let mode: Mode = { rate: 1 }
  let wordDelay = 0
  let failMessage: string | null = null
  let handlers: SpeechToTextHandlers | null = null
  let open = false
  let pendingMs = 0
  let budget = 0
  let taken = 0
  let connections = 0
  let endTurns = 0
  let lost = 0
  let pump: { cancel: () => void } | null = null
  const received: Array<{ t: number; ms: number }> = []
  let held: Array<() => void> = []

  const stalled = () => mode.rate === 0
  const take = (ms: number) => { pendingMs -= ms; taken += ms }
  const drainBudget = () => {
    budget += mode.rate * PUMP_MS
    const ms = Math.min(pendingMs, budget)
    budget -= ms
    take(ms)
    if (pendingMs === 0) budget = 0
  }
  const releaseHeld = () => { const run = held; held = []; run.forEach(fn => fn()) }

  const stopPump = () => { pump?.cancel(); pump = null }
  const close = () => { open = false; stopPump(); pendingMs = 0; held = [] }

  return {
    async connect(h) {
      if (failMessage !== null) { const message = failMessage; failMessage = null; throw new Error(message) }
      handlers = h
      open = true
      pendingMs = 0
      connections++
      stopPump()
      pump = clock.every(PUMP_MS, drainBudget)
      const connection: SpeechToTextConnection = {
        send: (pcm) => {
          if (!open || handlers !== h) { lost++; return }
          const ms = (pcm.length * 1000) / 16_000
          received.push({ t: clock.now(), ms })
          pendingMs += ms
          if (mode.rate === 1) take(pendingMs)
        },
        bufferedMs: () => pendingMs,
        endTurn: () => { endTurns++ },
        close: () => { if (handlers === h) close() },
      }
      return connection
    },
    slow: (rate) => { mode = { rate } },
    stall: () => { mode = { rate: 0 } },
    resume: (rate = 1) => { mode = { rate }; if (rate === 1) take(pendingMs); releaseHeld() },
    burst: () => { take(pendingMs); mode = { rate: 1 }; releaseHeld() },
    drop: (reason = 'dropped') => { const h = handlers; close(); h?.onClose(reason) },
    error: (message) => { handlers?.onError(message) },
    delayWordsBy: (ms) => { wordDelay = ms },
    failNextConnect: (message) => { failMessage = message },
    say: (text, words, committed, order = null) => {
      const h = handlers
      if (!open || !h) return
      const send = () => { if (open && handlers === h) h.onWords(text, words, committed, order) }
      const go = () => { if (wordDelay > 0) clock.after(wordDelay, send); else send() }
      if (stalled()) held.push(go); else go()
    },
    connections: () => connections,
    takenMs: () => taken,
    received: () => received,
    endTurns: () => endTurns,
    lostSends: () => lost,
  }
}
