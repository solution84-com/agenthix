import { fakeClock, type FakeClock } from '../../clock'
import type { VoiceEvent, VoiceEventKind, VoiceEventOf } from '../../events'
import { createVoiceRuntime } from '../../runtime/runtime'
import type { Adapter, AnyComponent, Overflow, VoiceRuntime, VoiceRuntimeOptions } from '../../runtime/types'
import { VOICE_SETTINGS, type VoiceSettings } from '../../settings'
import { fakeSpeechToText, type FakeSpeechToText } from './fakeSpeechToText'
import { wordsOf, type RecordedMessage } from './recording'
import { WAV_SAMPLE_RATE } from './wav'

export const FRAME_SAMPLES = 512
export const FRAME_MS = (FRAME_SAMPLES * 1000) / WAV_SAMPLE_RATE

export type ReplayEnv = { clock: FakeClock; speech: FakeSpeechToText; runtime: VoiceRuntime }

export type ReplayOptions = {
  components: AnyComponent[]
  /** Adapters, or a function that makes them from the fake clock and the fake speech service the replay built. */
  adapters?: Adapter[] | ((env: Pick<ReplayEnv, 'clock' | 'speech'>) => Adapter[])
  settings?: VoiceSettings
  /** 16 kHz mono PCM16, fed as `audio.frame` events at the pace of the audio. */
  audio?: Int16Array
  /** The provider's recorded messages; `Turn` messages go out through the fake speech service at their recorded times. */
  messages?: RecordedMessage[]
  /** Where the clock starts. */
  startAt?: number
  /** How long to keep running after the audio and the last message. */
  tailMs?: number
  runtime?: Pick<VoiceRuntimeOptions, 'queueLimits' | 'tickMs' | 'logSize'>
  /** Called before each step of the replay, with the clock's time, to script a fault at a moment. */
  at?: Array<{ ms: number; run: (env: ReplayEnv) => void }>
}

const matches = (event: VoiceEvent, what: VoiceEventKind | ((e: VoiceEvent) => boolean)) =>
  typeof what === 'function' ? what(event) : event.kind === what

export class ReplayResult {
  constructor(
    readonly events: readonly VoiceEvent[],
    readonly overflows: readonly Overflow[],
    readonly env: ReplayEnv,
  ) {}

  of<K extends VoiceEventKind>(kind: K): VoiceEventOf<K>[] {
    return this.events.filter((e): e is VoiceEventOf<K> => e.kind === kind)
  }

  first(what: VoiceEventKind | ((e: VoiceEvent) => boolean), after = -Infinity): VoiceEvent | undefined {
    return this.events.find(e => e.t >= after && matches(e, what))
  }

  /** Milliseconds from the first `from` event to the first `to` event at or after it; null if either is missing. */
  between(from: VoiceEventKind | ((e: VoiceEvent) => boolean), to: VoiceEventKind | ((e: VoiceEvent) => boolean)): number | null {
    const start = this.first(from)
    if (!start) return null
    const end = this.events.find(e => e.seq > start.seq && matches(e, to))
    return end ? end.t - start.t : null
  }
}

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

/** Plays audio and recorded provider messages through a runtime on a fake clock, and returns what it logged. */
export async function replay(options: ReplayOptions): Promise<ReplayResult> {
  const clock = fakeClock(options.startAt ?? 0)
  const speech = fakeSpeechToText(clock)
  const adapters = typeof options.adapters === 'function' ? options.adapters({ clock, speech }) : (options.adapters ?? [])
  const runtime = createVoiceRuntime({
    components: options.components, adapters, settings: options.settings ?? VOICE_SETTINGS, clock, ...options.runtime,
  })
  const env: ReplayEnv = { clock, speech, runtime }
  const start = clock.now()

  const audio = options.audio ?? new Int16Array(0)
  const frames = Math.floor(audio.length / FRAME_SAMPLES)
  const messages = options.messages ?? []
  const lastMessage = messages.reduce((m, r) => Math.max(m, r.at), 0)
  const duration = Math.max(frames * FRAME_MS, lastMessage) + (options.tailMs ?? 2_000)

  runtime.start()
  await flush()
  for (const { at, msg } of messages) {
    const words = wordsOf(msg)
    if (words) clock.after(at, () => speech.say(words.text, words.words, words.committed, words.order))
  }
  const script = [...(options.at ?? [])].sort((a, b) => a.ms - b.ms)

  const advanceTo = async (ms: number) => {
    while (clock.now() - start < ms) {
      const step = Math.min(10, ms - (clock.now() - start))
      clock.advance(step)
      await flush()
    }
  }
  let nextFrame = 0
  // Events happen in time order: the next frame, or the next scripted moment, whichever is first.
  for (;;) {
    const frameAt = nextFrame < frames ? (nextFrame + 1) * FRAME_MS : Infinity
    const scriptAt = script[0]?.ms ?? Infinity
    if (frameAt === Infinity && scriptAt === Infinity) break
    if (scriptAt <= frameAt) {
      await advanceTo(scriptAt)
      script.shift()!.run(env)
    } else {
      await advanceTo(frameAt)
      const pcm = audio.slice(nextFrame * FRAME_SAMPLES, (nextFrame + 1) * FRAME_SAMPLES)
      runtime.publish({ kind: 'audio.frame', pcm, t: clock.now() })
      nextFrame++
    }
    await flush()
  }
  await advanceTo(duration)
  runtime.stop()
  return new ReplayResult([...runtime.log()], [...runtime.overflows()], env)
}
