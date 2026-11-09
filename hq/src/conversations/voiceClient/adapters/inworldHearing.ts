/**
 * Inworld's streaming speech to text as the browser speaks to it, behind `SpeechToText`, on a single-use token from
 * hq (the socket's `bearer_` sub-protocol; the key never reaches the browser). Beside AssemblyAI's adapter, and the
 * same to everything after the port:
 *
 * - **Turn numbers.** Inworld sends none, and the reconciler closes a connection's turn once committed, so the
 *   adapter numbers them: every message of a turn carries its number, and a final moves to the next.
 * - **Ending a turn.** Voice ends turns itself (`endTurn`, `{"endTurn":{}}`); the service's own detection is set to
 *   voice's values, in its 96 ms steps.
 * - **The 30 s cap.** Inworld ends a turn by itself at about 30 s, mid-word if need be. Once a turn has run
 *   `TURN_CAP_SOFT_MS` of audio, the adapter ends it at the next pause the service reports (`speechStopped`), so a
 *   long monologue is cut between words; with no pause, Inworld's own cut arrives as an ordinary final. Either way
 *   it is one more committed turn, which the utterance code joins into the person's message.
 * - **No vocabulary.** A vocabulary list (`prompts`) made the service invent a word from silence, so none is sent.
 */
import type { SpeechToText, SpeechToTextConnection, SpeechToTextHandlers, ServiceWord } from '../ports'
import { SPEECH_RATE } from '../resample'
import type { SpeechTrace } from '../speechTiming'
import { gatherAudio, MESSAGE_MS, type SttConfig } from './assemblyAi'

export const INWORLD_STT_URL = 'wss://api.inworld.ai/stt/v1/transcribe:streamBidirectional'
export const INWORLD_DEFAULT_MODEL = 'inworld/inworld-stt-1'

/** Under Inworld's cap of about 30 s a turn: past this, the turn ends at the next pause. */
export const TURN_CAP_SOFT_MS = 25_000

/** Voice's end-of-turn values (AssemblyAI's `VOICE_STT_CONFIG`: 0.7, 500 ms, 3000 ms), in Inworld's 96 ms steps. */
const TURN_SETTINGS = {
  endOfTurnConfidenceThreshold: 0.7,
  inworldSttV1Config: { minEndOfTurnSilenceWhenConfident: 480, maxTurnSilence: 2976 },
}

/** The first frame: what the socket hears and how. Only the model and a language hint are taken from hq's config. */
export function transcribeConfig(config: SttConfig = {}) {
  const modelId = typeof config.modelId === 'string' && config.modelId ? config.modelId : INWORLD_DEFAULT_MODEL
  const language = typeof config.language === 'string' && config.language ? { language: config.language } : {}
  return {
    transcribeConfig: {
      modelId, audioEncoding: 'LINEAR16', sampleRateHertz: SPEECH_RATE, numberOfChannels: 1, includeWordTimestamps: true,
      ...language, ...TURN_SETTINGS,
    },
    audioProtocol: 'BINARY',
  }
}

export type InworldMessage =
  | { kind: 'words'; text: string; words: ServiceWord[]; final: boolean }
  | { kind: 'pause' }
  | { kind: 'error'; message: string }
  | null

/** One frame from the service. Word times are in ms of audio sent on this socket, as AssemblyAI's are. */
export function readInworldMessage(data: unknown): InworldMessage {
  let msg: {
    error?: { message?: unknown }
    result?: {
      transcription?: { transcript?: unknown; isFinal?: unknown; wordTimestamps?: { word?: unknown; startTimeMs?: unknown; endTimeMs?: unknown }[] }
      speechStopped?: unknown
    }
  }
  try { msg = JSON.parse(String(data)) } catch { return null }
  if (msg?.error) return { kind: 'error', message: typeof msg.error.message === 'string' ? msg.error.message : 'The speech service reported an error' }
  if (msg?.result?.speechStopped) return { kind: 'pause' }
  const t = msg?.result?.transcription
  if (!t) return null
  const words = (Array.isArray(t.wordTimestamps) ? t.wordTimestamps : [])
    .filter(w => typeof w?.word === 'string' && typeof w.startTimeMs === 'number')
    .map(w => ({ text: w.word as string, start: w.startTimeMs as number, end: typeof w.endTimeMs === 'number' ? w.endTimeMs : w.startTimeMs as number }))
  return { kind: 'words', text: typeof t.transcript === 'string' ? t.transcript.trim() : '', words, final: t.isFinal === true }
}

export type InworldHearingOptions = {
  token: string
  config?: SttConfig
  trace?: SpeechTrace
  /** As AssemblyAI's: the connection is open, called as it opens, before `connect` resolves. */
  onOpen?: (connection: SpeechToTextConnection) => void
}

const msOfBytes = (bytes: number) => bytes / 2 / (SPEECH_RATE / 1000)
const SAMPLES_PER_MS = SPEECH_RATE / 1000

/** One Inworld socket per `connect`, on the single-use token given. */
export function inworldHearing(opts: InworldHearingOptions): SpeechToText {
  return {
    connect: (handlers: SpeechToTextHandlers) => new Promise((resolve) => {
      const socket = new WebSocket(INWORLD_STT_URL, [`bearer_${opts.token}`])
      socket.binaryType = 'arraybuffer'
      opts.trace?.mark('socket created')
      let closed = false
      /** Audio sent on this socket, in ms: the clock word times are on. */
      let sentMs = 0
      let turn = 0
      let shown = false
      /** Audio sent when the turn's first words came; whether the adapter has asked it to end. */
      let turnFrom: number | null = null
      let ending = false
      const audio = gatherAudio(MESSAGE_MS, (pcm) => {
        socket.send(pcm as Int16Array<ArrayBuffer>)
        sentMs += pcm.length / SAMPLES_PER_MS
      })
      const endTurn = () => {
        if (socket.readyState !== WebSocket.OPEN) return
        audio.flush()
        socket.send(JSON.stringify({ endTurn: {} }))
      }
      const connection: SpeechToTextConnection = {
        send: (pcm) => audio.add(pcm),
        bufferedMs: () => audio.heldMs() + (socket.readyState === WebSocket.OPEN ? msOfBytes(socket.bufferedAmount) : 0),
        endTurn,
        close: () => {
          closed = true
          socket.onmessage = null; socket.onclose = null; socket.onopen = null
          try {
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ closeStream: {} }))
            socket.close()
          } catch { /* closed */ }
        },
      }
      socket.onopen = () => {
        socket.send(JSON.stringify(transcribeConfig(opts.config)))
        opts.onOpen?.(connection)
        resolve(connection)
      }
      socket.onmessage = (event) => {
        if (closed) return
        opts.trace?.message(event.data)
        const msg = readInworldMessage(event.data)
        if (!msg) return
        if (msg.kind === 'error') { handlers.onError(msg.message); return }
        if (msg.kind === 'pause') {
          if (!ending && turnFrom !== null && sentMs - turnFrom >= TURN_CAP_SOFT_MS) { ending = true; endTurn() }
          return
        }
        if (!msg.final) {
          if (!msg.text) return
          shown = true
          turnFrom ??= sentMs
          handlers.onWords(msg.text, msg.words, false, turn)
          return
        }
        // An empty final after words were shown says they were not speech: committed as nothing.
        if (msg.text || shown) handlers.onWords(msg.text, msg.words, true, turn)
        turn++
        shown = false
        turnFrom = null
        ending = false
      }
      socket.onclose = () => handlers.onClose('The speech service closed the connection.')
    }),
  }
}
