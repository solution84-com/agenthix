/**
 * The organisation's speech service (AssemblyAI streaming, v3) as the browser speaks to it, behind `SpeechToText`:
 * the socket's address with its settings, what its messages mean, and one connection on a token from hq.
 */

import type { ServiceWord, SpeechToText, SpeechToTextConnection, SpeechToTextHandlers } from '../ports'
import { SPEECH_RATE } from '../resample'
import type { SpeechTrace } from '../speechTiming'

export type SttConfig = Record<string, string | number | boolean | string[] | undefined>

const DEFAULT_STT_CONFIG: SttConfig = {
  speech_model: 'u3-rt-pro',
  format_turns: true,
  end_of_turn_confidence_threshold: 0.7,
  min_end_of_turn_silence_when_confident: 600,
  max_turn_silence: 2500,
  vad_threshold: 0.4,
  u3_rt_pro_vad_threshold: 0.5,
}

/**
 * Voice's end of turn is the turn decision's (Semantics), not the service's: the service's only fixes and formats
 * the words, so it may end a turn soon, and the formatted words usually arrive by the decision's first mark. A turn
 * that ends a sentence ends after `min_turn_silence` (Universal-3 Pro; Universal Streaming:
 * `min_end_of_turn_silence_when_confident`, above the confidence threshold), and any turn after `max_turn_silence`,
 * the decision's cap. Each model ignores the other's names.
 */
export const VOICE_STT_CONFIG: SttConfig = {
  min_turn_silence: 500,
  min_end_of_turn_silence_when_confident: 500,
  end_of_turn_confidence_threshold: 0.7,
  max_turn_silence: 3000,
}

export function buildSpeechUrl(token: string, config: SttConfig = {}): string {
  const merged = { ...DEFAULT_STT_CONFIG, ...config }
  const params = new URLSearchParams()
  params.set('token', token)
  params.set('sample_rate', String(SPEECH_RATE))
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === '' || value === false) continue
    if (Array.isArray(value)) value.forEach(v => params.append(key, v))
    else params.set(key, String(value))
  }
  return `wss://streaming.assemblyai.com/v3/ws?${params.toString()}`
}

/** `order` is the service's turn number: every message of one turn carries it, and the latest supersedes the rest. */
export type SpeechMessage =
  | { kind: 'partial'; text: string; order: number | null; words: ServiceWord[] }
  | { kind: 'turn'; text: string; order: number | null; words: ServiceWord[] }
  | { kind: 'error'; message: string }
  | null

export type { ServiceWord }

/**
 * One frame from the service. A turn ends on `end_of_turn`; when the service formats turns it sends the end twice
 * (raw, then formatted), and only the formatted one counts.
 */
export function readSpeechMessage(data: unknown): SpeechMessage {
  let msg: {
    type?: string; transcript?: string; end_of_turn?: boolean; turn_is_formatted?: boolean; turn_order?: unknown; error?: string
    words?: { text?: unknown; start?: unknown; end?: unknown }[]
  }
  try { msg = JSON.parse(String(data)) } catch { return null }
  if (msg.type === 'Error') return { kind: 'error', message: msg.error ?? 'The speech service reported an error' }
  if (msg.type !== 'Turn' || !msg.transcript?.trim()) return null
  const order = typeof msg.turn_order === 'number' ? msg.turn_order : null
  const words = (Array.isArray(msg.words) ? msg.words : [])
    .filter((w): w is ServiceWord => typeof w?.text === 'string' && typeof w.start === 'number')
    .map(w => ({ text: w.text, start: w.start, end: typeof w.end === 'number' ? w.end : w.start }))
  // A turn in progress puts only its final words in `transcript`; the word still being heard is in `words` alone.
  const heard = words.length > 0 ? words.map(w => w.text).join(' ') : msg.transcript
  if (!msg.end_of_turn || msg.turn_is_formatted === false) return { kind: 'partial', text: heard, order, words }
  return { kind: 'turn', text: msg.transcript.trim(), order, words }
}

export type AssemblyAiOptions = {
  token: string
  config?: SttConfig
  /** Development builds only: when the socket was made, and each message as it came. */
  trace?: SpeechTrace
  /**
   * The connection is open, called as it opens. `connect` resolves then too, a moment later; audio held for the
   * socket is sent from here, before anything else can be.
   */
  onOpen?: (connection: SpeechToTextConnection) => void
}

const msOfBytes = (bytes: number) => bytes / 2 / (SPEECH_RATE / 1000)

/**
 * Audio goes to the service in messages of at least this much: the microphone gives 32 ms frames, and AssemblyAI's
 * guidance is 50 ms close to a live microphone, 100 ms a good default.
 */
export const MESSAGE_MS = 100

/** Frames gathered into messages of at least `ms`, each handed to `send` whole. */
export function gatherAudio(ms: number, send: (pcm: Int16Array) => void) {
  const want = ms * (SPEECH_RATE / 1000)
  let held: Int16Array[] = []
  let samples = 0
  const flush = () => {
    if (samples === 0) return
    const message = new Int16Array(samples)
    let at = 0
    for (const pcm of held) { message.set(pcm, at); at += pcm.length }
    held = []
    samples = 0
    send(message)
  }
  return {
    add(pcm: Int16Array) {
      held.push(pcm)
      samples += pcm.length
      if (samples >= want) flush()
    },
    flush,
    heldMs: () => samples / (SPEECH_RATE / 1000),
  }
}

/** One AssemblyAI socket per `connect`, on the token given. */
export function assemblyAi(opts: AssemblyAiOptions): SpeechToText {
  return {
    connect: (handlers: SpeechToTextHandlers) => new Promise((resolve) => {
      const socket = new WebSocket(buildSpeechUrl(opts.token, opts.config))
      opts.trace?.mark('socket created')
      // A handler kept from before the close still runs: once closed, the socket says nothing more.
      let closed = false
      // The microphone's audio is never on a shared buffer.
      const audio = gatherAudio(MESSAGE_MS, pcm => socket.send(pcm as Int16Array<ArrayBuffer>))
      const connection: SpeechToTextConnection = {
        send: (pcm) => audio.add(pcm),
        bufferedMs: () => audio.heldMs() + (socket.readyState === WebSocket.OPEN ? msOfBytes(socket.bufferedAmount) : 0),
        endTurn: () => {
          if (socket.readyState !== WebSocket.OPEN) return
          audio.flush()
          socket.send(JSON.stringify({ type: 'ForceEndpoint' }))
        },
        close: () => {
          closed = true
          socket.onmessage = null; socket.onclose = null; socket.onopen = null
          try {
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'Terminate' }))
            socket.close()
          } catch { /* closed */ }
        },
      }
      socket.onopen = () => {
        opts.onOpen?.(connection)
        resolve(connection)
      }
      socket.onmessage = (event) => {
        if (closed) return
        opts.trace?.message(event.data)
        const msg = readSpeechMessage(event.data)
        if (!msg) return
        if (msg.kind === 'error') handlers.onError(msg.message)
        else handlers.onWords(msg.text, msg.words, msg.kind === 'turn', msg.order)
      }
      socket.onclose = () => handlers.onClose('The speech service closed the connection.')
    }),
  }
}
