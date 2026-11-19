/**
 * A voice session under the light model (adaptive voice listening), on the session rig (`./sessionRig`): hq is the fake
 * socket, and each line and the reply play on a playback of their own, heard to its end `PLAY_MS` after its audio came.
 */
import { CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET as V, type VoiceListenPayload } from '@agenthix/core'
import type { FakeClock } from '../clock'
import type { Playback } from '../playback'
import { script } from '../stt/__tests__/transcribing'
import { C, rig, type RigOptions } from './sessionRig'

export const PLAY_MS = 800

export function timedPlayback(clock: FakeClock, ms: number) {
  let at = -Infinity
  let finished = false
  const state = { enqueued: 0, stopped: 0, closedEarly: 0, ducked: 0, played: (): Int16Array => new Int16Array(0) }
  const idle = () => finished && clock.now() - at >= ms
  const playback: Playback = {
    enqueue: () => { state.enqueued++; at = clock.now() },
    finish: () => { finished = true },
    stop: () => { state.stopped++; return -1 },
    position: () => (Number.isFinite(at) ? { index: 0, elapsed: Math.min(clock.now() - at, ms) / 1000, ended: false } : null),
    idle,
    close: () => { if (!idle()) state.closedEarly++ },
    duck: () => { state.ducked++ },
    resume: () => undefined,
    heardAudio: () => state.played(),
  }
  return { playback, state }
}

export type Made = ReturnType<typeof timedPlayback>

export function lightRig(opts: RigOptions & { adaptiveVoice?: boolean; voiceListener?: boolean; playMs?: number } = {}) {
  const made: Made[] = []
  let clock: FakeClock | null = null
  const r = rig({
    turnScores: [0.95],
    ...opts,
    deps: {
      adaptiveVoice: () => opts.adaptiveVoice ?? true,
      voiceListener: () => opts.voiceListener ?? true,
      createPlayback: () => { const p = timedPlayback(clock!, opts.playMs ?? PLAY_MS); made.push(p); return p.playback },
      ...opts.deps,
    },
  })
  clock = r.clock
  const listens = () => r.emitted.filter(e => e[0] === V.listen).map(e => e[1] as VoiceListenPayload)
  const answer = (a: { seq: number; action?: string; say?: string; lineId?: string; turn?: string; turnId?: string; off?: boolean; nextCheckSecs?: number }) =>
    r.receive(V.listened, { conversationId: C, action: 'keep_listening', nextCheckSecs: 2, ...a })
  const line = (lineId: string, text: string, stored = false) =>
    r.receive(V.line, { conversationId: C, lineId, text, audio: new ArrayBuffer(8), ...(stored && { stored }) })
  const playedLines = () => r.of('phrase.at').filter(e => e.lineId && !e.playing).map(e => e.text)
  const linesStarted = () => [...new Set(r.of('phrase.at').filter(e => e.lineId && e.playing).map(e => e.text))]
  const lineReports = () => r.emitted.filter(e => e[0] === V.linePlayed).map(e => e[1] as { lineId: string; skipped?: true })
  const linePlayed = () => lineReports().filter(e => !e.skipped).map(e => e.lineId)
  const lineSkipped = () => lineReports().filter(e => e.skipped).map(e => e.lineId)
  /** hq speaks a reply: one sentence, its audio, and the turn spoken. */
  const reply = (turnId: string, text: string) => {
    r.receive(CONVERSATION_SOCKET.delta, { conversationId: C, turnId, offset: 0, text })
    r.receive(V.sentence, {
      conversationId: C, turnId, index: 0, text, textStart: 0, textEnd: text.length, words: text.split(' '),
      wordStartSecs: text.split(' ').map((_, i) => i * 0.3), wordEndSecs: text.split(' ').map((_, i) => i * 0.3 + 0.25),
    })
    r.receive(V.audio, { conversationId: C, turnId, index: 0, audio: new ArrayBuffer(8) })
    r.receive(V.turnSpoken, { conversationId: C, turnId, sentences: 1 })
  }
  return { ...r, made, listens, answer, line, playedLines, linesStarted, linePlayed, lineSkipped, reply }
}

/** The person says `words` words, numbered from `from`, then is quiet `quietMs`. */
export const speech = (words: number, from = 0) => script([[words, 0]], 8, 300).audio.map(x => (x === 0 ? 0 : x + from))

export type LightRig = ReturnType<typeof lightRig>
