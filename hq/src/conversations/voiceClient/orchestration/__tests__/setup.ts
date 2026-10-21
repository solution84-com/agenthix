import { fakeClock } from '../../clock'
import type { VoiceEvent, VoiceEventBody, VoiceEventInput, VoiceEventKind } from '../../events'
import { createVoiceRuntime } from '../../runtime/runtime'
import type { AnyComponent } from '../../runtime/types'
import { VOICE_SETTINGS, type VoiceSettings } from '../../settings'

/** STT always keeps up with the person here (no `stt.words` are published): READY sends at once. */
export const KEEPING_UP: VoiceSettings = { ...VOICE_SETTINGS, inbound: { ...VOICE_SETTINGS.inbound, readyHeardMs: Infinity } }

/** A runtime of the given components on a fake clock, recording every event of `watch` it delivers. */
export function rig(components: AnyComponent[], watch: readonly VoiceEventKind[], settings: VoiceSettings = KEEPING_UP) {
  const runtime = createVoiceRuntime({ components, adapters: [], settings, clock: fakeClock() })
  const out: VoiceEvent[] = []
  runtime.subscribe(watch, e => out.push(e))
  let t = 0
  const send = (event: VoiceEventInput) => { t = Math.max(t, event.t); runtime.publish(event) }
  return {
    runtime,
    out,
    send,
    /** Publishes `body` at `at` (or the last time seen). */
    at: (at: number, body: VoiceEventBody) => send({ ...body, t: at }),
    /** Ticks the clock every 50 ms from the last time seen up to `until`. */
    tickTo(until: number) { for (let next = t + 50; next <= until; next += 50) send({ kind: 'clock.tick', t: next }) },
    kinds: () => out.map(e => e.kind),
    of: <K extends VoiceEventKind>(kind: K) => out.filter((e): e is Extract<VoiceEvent, { kind: K }> => e.kind === kind),
    clear: () => { out.length = 0 },
  }
}

export const silence = (silent: boolean) => ({ kind: 'acoustic.silence', silent }) as const

export const heard = (text: string, order: number | null = 1, committed = false): VoiceEventBody => ({
  kind: 'stt.heard', heard: text, text, words: text.split(/\s+/).filter(Boolean).length,
  dropped: { echo: 0, noise: 0 }, committed, order, timed: [],
})

export const playing = (replyId: string, index = 0) =>
  ({ kind: 'playback.at', replyId, index, elapsedMs: 0, ended: false, playing: true }) as const

export const stopped = (replyId: string, heardToEnd: boolean) =>
  ({ kind: 'playback.at', replyId, index: 0, elapsedMs: 0, ended: heardToEnd, playing: false }) as const
