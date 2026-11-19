/**
 * The playground Log's shapes (adaptive voice listening, the Log as turns): every step names who acted (its actor,
 * the badge) and what they did (its tag). Nine actors: YOU, the person; SOUND, the sound model that decides they
 * finished; LIGHT, the light model; HEAVY, the conversation model; SYSTEM, hq's own rules; BACKCHANNEL, the hums
 * played by rule while you talk; PACE, how the agent listens to you now (your pace, learned from your breaths, and the
 * listening style you asked for); VOICE, how you sound, as the voice profile reads it; TONE, the voice hint the
 * models are offered. The steps are grouped into
 * one card per turn (`logTurns.ts`), and each card is checked against three rules (`logRules.ts`).
 */
import type { ListenerToolName } from '../../voice/listener/tools'

export type LogActor = 'YOU' | 'SOUND' | 'LIGHT' | 'HEAVY' | 'SYSTEM' | 'BACKCHANNEL' | 'PACE' | ToneActor

/** Tone (`toneSteps.ts`): VOICE, how you sound as the voice profile read it; TONE, the voice hint as it changed. */
export type ToneActor = 'VOICE' | 'TONE'

export const LOG_ACTORS: readonly LogActor[] = ['YOU', 'SOUND', 'LIGHT', 'HEAVY', 'SYSTEM', 'BACKCHANNEL', 'PACE', 'VOICE', 'TONE']

/**
 * LIGHT's tag is the action it chose, or `no answer`; `line` is the words it, or SYSTEM, played; BACKCHANNEL's is `hum`,
 * `no hum` for a pause that had none (a near miss), or `service` for an answer of the hum service.
 */
export type LogTag =
  | 'said' | 'stopped the reply' | 'finished' | ListenerToolName | 'no answer' | 'line' | 'reply' | 'recap' | 'close' | 'notice' | 'error'
  | 'hum' | 'no hum' | 'service' | 'pace' | 'style'
  | 'voice' | 'tone'

/**
 * How a turn ended, as its ending step says it. `bound`: kept open to the "not yet" limit, handed over; `limit`: closed
 * at that limit after an invitation nobody answered; `off`: no light model, plain voice.
 */
export type TurnEnd = 'handedOver' | 'closed' | 'fallback' | 'bound' | 'limit' | 'off'

export type LogStep = {
  id: string
  /** Ms since the epoch: when it happened (a check, when it was asked; a line, when it began to play). */
  at: number
  actor: LogActor
  tag: LogTag
  title: string
  /** Its small text: a call's time, how a line played, the tokens. */
  detail?: string
  /** Shown as the row's `data-` attributes, for a test to read from the page. */
  attrs?: Readonly<Record<string, string>>
  /** Shown under Errors. */
  error?: boolean
  /** YOU: a typed message, which always starts a turn. */
  typed?: boolean
  /** YOU: when the last words of the stretch came. */
  until?: number
  /** LIGHT: one of its checks (not a line). */
  check?: boolean
  /** This step ended the turn, and how. */
  ends?: TurnEnd
  /** A check on a turn kept open after a "not yet", or SYSTEM closing it at the limit: may end the turn without SOUND. */
  afterNotYet?: boolean
  /** LIGHT: a sounds finished check whose answer kept the turn open. */
  notYet?: boolean
  /** SOUND finished: when you stopped speaking, as it heard (its verdict, less the quiet before it). */
  stoppedAt?: number
  /** Something the person heard: a line, or the reply's first words. */
  heard?: boolean
  /** BACKCHANNEL: a pause with no hum, folded under the card's count of near misses; it cuts no stretch of your words. */
  nearMiss?: boolean
  /** PACE, VOICE and TONE: a note on how the agent listens, or how you sound; it cuts no stretch of your words. */
  aside?: boolean
  /** BACKCHANNEL: an answer of the hum service, folded under the card's one line of them; it cuts no stretch either. */
  service?: { kind: string | null; tone: string | null; ms: number; skipped: number; dropped: boolean; atPause?: boolean }
  /** HEAVY: the reply's words, written: the turn is answered. */
  answers?: boolean
  /** HEAVY: a reply never heard, replaced after the person went on. */
  withdrawn?: boolean
  /** A line: the step it came from, by id; `system` for the SYSTEM step before it. */
  from?: string
  /** Words for the decision a line came from ("the hand_over"), when `from` is shown. */
  fromWords?: string
  /** LIGHT: the reason the call gave, shown as "why: …" under the title. Playground only, like the held-back answer. */
  why?: string
  /** LIGHT: the call ran with the reason on, so its time is not production's. */
  reasonOn?: boolean
  /** HEAVY reply: say how long after the hand over its words came. */
  sinceEnd?: boolean
}

/** A step as a card shows it: its time from the turn's start, its text resolved, and the rule it breaks, if any. */
export type CardStep = LogStep & { rel: number; ruleBroken?: 1 | 2 | 3 }

export type LogCard = {
  id: string
  /** When the person started speaking: the card's 0.0 s. */
  zero: number
  steps: CardStep[]
  /** Their whole message, as sent. */
  message: string
  outcome: string
  /** "you stopped at 2.9 s", "first sound 1.7 s after you stopped", "answer 5.3 s after you stopped". */
  timings: string[]
  /** A call in the card ran with the reason on: its timings are not production's. */
  reasonOn?: boolean
}

export type LogFilter = 'all' | 'you' | 'sound' | 'light' | 'heavy' | 'system' | 'backchannel' | 'pace' | 'tone' | 'errors'

export const LOG_FILTERS: { value: LogFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'you', label: 'You' },
  { value: 'sound', label: 'Sound' },
  { value: 'light', label: 'Light' },
  { value: 'heavy', label: 'Heavy' },
  { value: 'system', label: 'System' },
  { value: 'backchannel', label: 'Backchannel' },
  { value: 'pace', label: 'Pace' },
  { value: 'tone', label: 'Voice and tone' },
  { value: 'errors', label: 'Errors' },
]

export function shows(filter: LogFilter, step: CardStep): boolean {
  if (filter === 'all') return true
  if (filter === 'errors') return step.error === true || step.ruleBroken !== undefined
  if (filter === 'tone') return step.actor === 'VOICE' || step.actor === 'TONE'
  return step.actor === filter.toUpperCase()
}

/** A line for the Log from outside the light model: the voice client's notice, the server's lines, a model call. */
export type LogNote = { id: string; at: number; kind: 'notice' | 'error'; title: string; detail?: string }

export const secs = (ms: number, places = 1) => `${(ms / 1000).toFixed(places)} s`

export const timeOfDay = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

/** The clock time to the millisecond, for a step's time on hover. */
export const exactTime = (at: number) => `${timeOfDay(at)}.${String(new Date(at).getMilliseconds()).padStart(3, '0')}`

/** The end of the words, where the newest are. */
export const shortened = (text: string, max = 60) => (text.length > max ? `…${text.slice(-max).trimStart()}` : text)

/** The start of the words, for a reply. */
export const opening = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text)
