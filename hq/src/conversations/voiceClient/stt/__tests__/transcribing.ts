/**
 * Test audio whose words can be recognised from the samples, and a speech service that recognises them, built on
 * phase 1's fake (which takes audio slowly, stalls, bursts and drops). Each frame of a word is filled with its code
 * (1000 + its index); silence is zeros. The service hears a word once it has taken the frame after it, sends it
 * `lagAt(where it ends in this connection's stream)` later, and commits a turn after `endpointMs` of silence, as a
 * real service would.
 */
import type { FakeClock } from '../../clock'
import type { ServiceWord, SpeechToText } from '../../ports'
import type { Component } from '../../runtime/types'
import type { FakeSpeechToText } from '../../__tests__/harness/fakeSpeechToText'
import { FRAME_MS, FRAME_SAMPLES } from '../../__tests__/harness/replay'

export const wordText = (index: number) => `w${index}`

/** A script: `[words, silenceMs]` pairs. Returns the audio and when each word was spoken. */
export function script(parts: Array<[words: number, silenceMs: number]>, framesPerWord = 8, leadMs = 500) {
  const frames: number[] = []
  const spoken: Array<{ text: string; startAt: number; endAt: number }> = []
  const silence = (ms: number) => { for (let i = 0; i < Math.round(ms / FRAME_MS); i++) frames.push(0) }
  silence(leadMs)
  let index = 0
  for (const [words, gap] of parts) {
    for (let w = 0; w < words; w++, index++) {
      const startAt = frames.length * FRAME_MS
      for (let f = 0; f < framesPerWord; f++) frames.push(1000 + index)
      spoken.push({ text: wordText(index), startAt, endAt: frames.length * FRAME_MS })
    }
    silence(gap)
  }
  return { audio: framesToAudio(frames), spoken }
}

export function framesToAudio(codes: number[]): Int16Array {
  const audio = new Int16Array(codes.length * FRAME_SAMPLES)
  codes.forEach((code, i) => audio.fill(code, i * FRAME_SAMPLES, (i + 1) * FRAME_SAMPLES))
  return audio
}

/**
 * Silence detection as Acoustic would give it: a voice once `onFrames` frames of it are heard (a short gap between
 * words does not start the count again), silence after `offFrames` frames of none.
 */
export function silenceDetector(onFrames = 8, offFrames = 5): Component<{ silent: boolean; voiced: number; quiet: number }> {
  return {
    name: 'test-silence',
    accepts: ['audio.frame'],
    init: () => ({ silent: true, voiced: 0, quiet: 0 }),
    step(state, event) {
      if (event.kind !== 'audio.frame') return { state, emit: [] }
      const voice = event.pcm[0] !== 0
      const quiet = voice ? 0 : state.quiet + 1
      const voiced = voice ? state.voiced + 1 : quiet >= offFrames ? 0 : state.voiced
      const silent = state.silent ? voiced < onFrames : quiet < offFrames ? false : true
      const next = { silent, voiced, quiet }
      return silent === state.silent ? { state: next, emit: [] }
        : { state: next, emit: [{ kind: 'acoustic.silence', silent, t: event.t }] }
    },
  }
}

export type TranscribingOptions = {
  lagAt?: (streamMs: number) => number
  endpointMs?: number
  /** A fault set on the fake lasts only for the connection it was set on, as a fresh connection starts level. */
  faultsPerConnection?: boolean
  /** The word the service hears for word `index` of the script; `w<index>` when not given. */
  textOf?: (index: number) => string
}

export function transcribing(clock: FakeClock, fake: FakeSpeechToText, opts: TranscribingOptions = {}): SpeechToText {
  const lagAt = opts.lagAt ?? (() => 300)
  const endpointMs = opts.endpointMs ?? 1_000
  const textOf = opts.textOf ?? wordText
  let current = 0
  return {
    async connect(handlers) {
      if (opts.faultsPerConnection) { fake.resume(1); fake.delayWordsBy(0) }
      const conn = await fake.connect(handlers)
      const id = ++current
      const takenAt = fake.takenMs()
      const stream: number[] = []
      let done = 0
      let run: { code: number; from: number } | null = null
      let turn: ServiceWord[] = []
      let order = 0
      let quietMs = 0
      const say = (words: ServiceWord[], committed: boolean, at: number) => {
        const copy = [...words]
        const o = order
        clock.after(lagAt(at), () => {
          if (current === id) fake.say(copy.map(w => w.text).join(' '), copy, committed, o)
        })
      }
      const poll = clock.every(10, () => {
        if (current !== id) { poll.cancel(); return }
        const taken = Math.floor((fake.takenMs() - takenAt) / FRAME_MS + 1e-9)
        for (; done < Math.min(taken, stream.length); done++) {
          const code = stream[done]!
          const at = done * FRAME_MS
          if (run && run.code !== code) {
            turn.push({ text: textOf(run.code - 1000), start: run.from, end: at })
            say(turn, false, at)
            run = null
          }
          if (code !== 0 && !run) { run = { code, from: at }; quietMs = 0 }
          if (code === 0) {
            quietMs += FRAME_MS
            if (turn.length && quietMs >= endpointMs) { say(turn, true, at); turn = []; order++ }
          }
        }
      })
      return {
        ...conn,
        send(pcm) { for (let i = 0; i < pcm.length; i += FRAME_SAMPLES) stream.push(pcm[i]!); conn.send(pcm) },
        close() { if (current === id) current++; poll.cancel(); conn.close() },
        // Like ForceEndpoint: the turn heard so far is finished.
        endTurn() {
          conn.endTurn()
          if (turn.length) { say(turn, true, done * FRAME_MS); turn = []; order++ }
        },
      }
    },
  }
}
