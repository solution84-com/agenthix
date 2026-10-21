/**
 * The shapes the runtime and every component share (adaptive voice spec, How it is built and tested). A component
 * is a pure state machine; adapters are the only code that touches the browser, the sockets or the models.
 */
import type { VoiceEvent, VoiceEventInput, VoiceEventKind, VoiceEventOf, VoiceLoop } from '../events'
import type { VoiceSettings } from '../settings'

/**
 * One component: `step` takes its state and one event, and returns its next state and the events it emits. No
 * timers, sockets, audio, models or `Date.now()` inside; time arrives as each event's `t` and as `clock.tick`.
 */
export type Component<S> = {
  name: string
  /** The kinds it wants delivered; anything else never reaches `step`. */
  accepts: readonly VoiceEventKind[]
  init: (settings: VoiceSettings) => S
  step: (state: S, event: VoiceEvent, settings: VoiceSettings) => { state: S; emit: VoiceEventInput[] }
}

// any: the runtime holds components whose state types differ; each component is typed where it is written.
export type AnyComponent = Component<any>

/** An adapter: the outside world on one side, events on the other. `start` returns what stops it. */
export type Adapter = {
  name: string
  start: (runtime: VoiceRuntimeHandle) => () => void
}

export type Unsubscribe = () => void

/** What adapters and the voice lab see of the runtime. */
export type VoiceRuntimeHandle = {
  publish: (event: VoiceEventInput) => void
  /** Every delivered event of these kinds ('*' for all), after it has gone through the components. */
  subscribe: <K extends VoiceEventKind = VoiceEventKind>(
    kinds: readonly K[] | '*', listener: (event: VoiceEventOf<K>) => void,
  ) => Unsubscribe
  settings: () => VoiceSettings
  now: () => number
}

export type QueueLimits = Record<VoiceLoop, number>

/** What a full queue did, so the limit is never silent. */
export type Overflow = { loop: VoiceLoop; dropped: VoiceEvent; at: number }

export type VoiceRuntime = VoiceRuntimeHandle & {
  start: () => void
  stop: () => void
  /** Drops every queued event that belongs to this reply, in every loop. */
  cancelReply: (replyId: string) => void
  /** The most recent events delivered, oldest first, bounded. */
  log: () => readonly VoiceEvent[]
  overflows: () => readonly Overflow[]
}

export type VoiceRuntimeOptions = {
  components: AnyComponent[]
  adapters: Adapter[]
  settings: VoiceSettings
  clock: import('../clock').Clock
  /** How many events each loop may hold waiting; the oldest that is not audio the person said is dropped first. */
  queueLimits?: Partial<QueueLimits>
  /** How often `clock.tick` is published. */
  tickMs?: number
  /** How many events the log keeps. */
  logSize?: number
}
