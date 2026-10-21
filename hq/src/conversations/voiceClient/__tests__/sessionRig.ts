/**
 * A voice session with everything outside the page replaced (adaptive voice spec, How it is built and tested):
 * hq's socket, the microphone, the two models, the speech service and playback are fakes, and the runtime runs on a
 * fake clock the test advances. Everything inside is the real thing: every layer's components and adapters, wired
 * as `voiceSession` wires them.
 *
 * The person's audio is the inbound tests' recognisable audio (`stt/__tests__/transcribing`): each frame of a word
 * carries its code, silence is zeros, and the fake speech service hears the words from it.
 */
import { vi } from 'vitest'
import { CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET as V } from '../../../shared/conversations/protocol'
import { fakeClock } from '../clock'
import type { VoiceEvent } from '../events'
import type { Playback, Playhead } from '../playback'
import type { SpeechToText, TurnModel, VoiceActivityModel } from '../ports'
import { VOICE_SETTINGS } from '../settings'
import { transcribing, type TranscribingOptions } from '../stt/__tests__/transcribing'
import { createVoiceSession, type LooseSocket, type VoiceDeps } from '../voiceSession'
import { fakeSpeechToText, type FakeSpeechToText } from './harness/fakeSpeechToText'
import { FRAME_MS, FRAME_SAMPLES } from './harness/replay'

export const C = 'c1'
export const ME = 'u1'

export function fakeSocket() {
  const handlers = new Map<string, Array<(e: unknown) => void>>()
  const emitted: Array<[string, unknown]> = []
  const socket: LooseSocket = {
    on: (event, h) => { handlers.set(event, [...(handlers.get(event) ?? []), h as never]) },
    off: (event, h) => { handlers.set(event, (handlers.get(event) ?? []).filter(x => x !== (h as never))) },
    emit: (event, payload) => { emitted.push([event, payload]) },
  }
  return { socket, emitted, receive: (event: string, payload: unknown) => (handlers.get(event) ?? []).forEach(h => h(payload)) }
}

export function fakePlayback() {
  const state = {
    head: null as Playhead | null, idle: false, heard: 1, enqueued: [] as number[], finished: false, stopped: 0,
    ducked: 0, resumed: 0,
    /** What the next `heardAudio` returns: what went to the speaker since the last call. */
    played: (): Int16Array => new Int16Array(0),
  }
  const playback: Playback = {
    enqueue: (i) => { state.enqueued.push(i) },
    finish: () => { state.finished = true },
    stop: () => { state.stopped++; state.head = null; return state.heard },
    position: () => state.head,
    idle: () => state.idle,
    close: () => undefined,
    duck: () => { state.ducked++ },
    resume: () => { state.resumed++ },
    heardAudio: () => state.played(),
  }
  return { state, playback }
}

export type RigOptions = {
  /** The turn model's score for each question, in order; the last repeats. */
  turnScores?: number[]
  /** Silence detection's model: a voice in any frame that is not silent. */
  vad?: (frame: Float32Array) => number
  /** The fake speech service hears words from the audio; `plain` hears only what the test says. */
  service?: TranscribingOptions | 'plain'
  deps?: Partial<VoiceDeps>
}

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

export function rig(opts: RigOptions = {}) {
  const clock = fakeClock(100_000)
  const s = fakeSocket()
  const pb = fakePlayback()
  const fake: FakeSpeechToText = fakeSpeechToText(clock)
  const service: SpeechToText = opts.service === 'plain' ? fake
    : transcribing(clock, fake, { endpointMs: 500, faultsPerConnection: true, ...opts.service })
  let push: ((pcm: Int16Array<ArrayBuffer>) => void) | null = null
  const vad: VoiceActivityModel = {
    score: async frame => (opts.vad ? opts.vad(frame) : frame.some(x => x !== 0) ? 0.95 : 0.02),
    reset: () => undefined,
  }
  const scores = opts.turnScores ?? [0.95]
  let asked = 0
  const turn: TurnModel = { score: async () => scores[Math.min(asked++, scores.length - 1)]! }
  const sendMessage = vi.fn(async (_args: { text: string }) => ({}))
  let ids = 0
  const session = createVoiceSession({
    socket: s.socket, userId: ME, createPlayback: () => pb.playback, getToken: async () => ({ token: 't' }),
    sendMessage, newId: () => `m${ids++}`, now: clock.now, clock, media: null, chime: () => undefined,
    openMicrophone: async (onAudio) => {
      push = onAudio
      return { stop: () => { push = null }, settings: () => ({ echoCancellation: true }), contextRate: 16_000 }
    },
    speechService: () => service, models: { vad, turn }, settings: VOICE_SETTINGS, ...opts.deps,
  })
  const events: VoiceEvent[] = []

  const advance = async (ms: number) => {
    for (let done = 0; done < ms;) {
      const step = Math.min(10, ms - done)
      clock.advance(step)
      if (vi.isFakeTimers()) vi.advanceTimersByTime(step)
      done += step
      await flush()
    }
  }
  /** Plays audio into the microphone at the pace it was spoken. */
  const hear = async (audio: Int16Array) => {
    for (let at = 0; at + FRAME_SAMPLES <= audio.length; at += FRAME_SAMPLES) {
      push?.(audio.slice(at, at + FRAME_SAMPLES) as Int16Array<ArrayBuffer>)
      await advance(FRAME_MS)
    }
  }
  const silence = (ms: number) => hear(new Int16Array(Math.round(ms / FRAME_MS) * FRAME_SAMPLES))

  return {
    clock, ...s, pb, fake, session, sendMessage, events, advance, hear, silence,
    asked: () => asked,
    sent: () => sendMessage.mock.calls.map(call => call[0].text),
    async start() {
      session.start(C, { name: 'Kernel', avatarUrl: null }, '/chat/c1')
      s.receive(V.state, { conversationId: C, holderId: ME, startedAt: 'now' })
      await flush()
      session.runtime()?.subscribe('*', e => { events.push(e) })
      await advance(100)
    },
    /** hq starts speaking a reply: its sentences, and the first one's audio, which playback starts on. */
    reply(turnId: string, sentences: string[]) {
      s.receive(CONVERSATION_SOCKET.delta, { conversationId: C, turnId, offset: 0, text: sentences.join(' ') })
      let at = 0
      sentences.forEach((text, index) => {
        s.receive(V.sentence, {
          conversationId: C, turnId, index, text, textStart: at, textEnd: at + text.length,
          words: text.split(' '), wordStartSecs: text.split(' ').map((_, i) => i * 0.3), wordEndSecs: text.split(' ').map((_, i) => i * 0.3 + 0.25),
        })
        at += text.length + 1
        s.receive(V.audio, { conversationId: C, turnId, index, audio: new ArrayBuffer(8) })
      })
      pb.state.idle = false
      pb.state.head = { index: 0, elapsed: 0, ended: false }
    },
    /** The reply has been heard to its end. */
    replyEnds(turnId: string, sentences: number) {
      s.receive(V.turnSpoken, { conversationId: C, turnId, sentences })
      pb.state.idle = true
    },
    of<K extends VoiceEvent['kind']>(kind: K) { return events.filter((e): e is Extract<VoiceEvent, { kind: K }> => e.kind === kind) },
    interrupts: () => s.emitted.filter(e => e[0] === V.interrupt),
  }
}

export type Rig = ReturnType<typeof rig>
