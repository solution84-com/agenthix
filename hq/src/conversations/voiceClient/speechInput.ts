/**
 * Dictation's speech to text: the microphone (`adapters/microphone`), streamed to the organisation's speech service
 * (`adapters/assemblyAi`) with a short-lived token from hq. The service says when a turn ends. Voice in a
 * conversation has its own inbound loop (`stt/`). Nothing here talks to hq's sockets.
 */

import { assemblyAi, buildSpeechUrl, readSpeechMessage, type ServiceWord, type SttConfig } from './adapters/assemblyAi'
import { openMicrophone, type Microphone } from './adapters/microphone'
import type { SpeechToTextConnection, SpeechToTextHandlers } from './ports'
import { SPEECH_RATE } from './resample'
import type { HeardWord } from './stt/echo'
import { createStreamClock } from './streamClock'
import type { SpeechTrace } from './speechTiming'

export { buildSpeechUrl, readSpeechMessage, type ServiceWord, type SpeechMessage, type SttConfig } from './adapters/assemblyAi'

export function rms(pcm16: Int16Array): number {
  if (pcm16.length === 0) return 0
  let sum = 0
  for (let i = 0; i < pcm16.length; i++) sum += (pcm16[i]! / 32768) ** 2
  return Math.sqrt(sum / pcm16.length)
}

/** Loud enough, twice in a row, to be a person speaking over the reply and not a click or a cough. */
const LOUD_RMS = 0.08
const LOUD_CHUNKS = 2
const CHUNK_BYTES = 3200 // 100 ms of 16 kHz PCM16
const MAX_RECONNECTS = 3
/** A token fetched ahead for the next socket is used only this fresh (hq's tokens last ten minutes). */
export const TOKEN_FRESH_MS = 5 * 60_000
/** A token kept ready is fetched again once this old, so one is always ready without a wait. */
const TOKEN_REFRESH_MS = 4 * 60_000
/** Audio heard before the socket opens is held, up to this much, and sent once it opens: the first words count. */
const HELD_CHUNKS = 150
/** Each socket numbers its turns from 0: turns are told apart across sockets by this much per socket. */
const ORDER_PER_SOCKET = 1_000

export function createLoudDetector(onLoud: () => void) {
  let run = 0
  return (level: number) => {
    run = level > LOUD_RMS ? run + 1 : 0
    if (run >= LOUD_CHUNKS) { run = 0; onLoud() }
  }
}

const msOf = (chunk: Int16Array) => chunk.length / (SPEECH_RATE / 1000)

export type SpeechInputOptions = {
  getToken: () => Promise<{ token: string; config?: SttConfig }>
  /** Settings over the organisation's, for this use of speech to text. */
  config?: SttConfig
  /** `words`: each word with when it was spoken, on the clock `now` reads. */
  onPartial: (text: string, order: number | null, words?: HeardWord[]) => void
  onTurn: (text: string, order: number | null, words?: HeardWord[]) => void
  /** Loud audio while `watchLoud()` holds. */
  onLoud?: () => void
  watchLoud?: () => boolean
  /** The microphone or the speech service could not be kept up: voice ends with this line. */
  onFail: (message: string) => void
  /** Development builds only: records timing, to measure how far the words shown lag behind speech. */
  trace?: SpeechTrace
  /** The clock words are timed on. */
  now?: () => number
}

export type SpeechInput = {
  start: () => Promise<void>
  stop: () => void
  setMuted: (muted: boolean) => void
}

/** Speech input that can also ask the service to end the turn now, without waiting for silence. */
export type EndableSpeechInput = SpeechInput & { endTurn: () => void }

export function createSpeechInput(opts: SpeechInputOptions): EndableSpeechInput {
  let mic: Microphone | null = null
  /** The socket being opened or in use; a handler of any other is stale. */
  let attempt: object | null = null
  let conn: SpeechToTextConnection | null = null
  let muted = false
  let stopped = false
  let reconnects = 0
  let pending: Int16Array[] = []
  let pendingBytes = 0
  type Held = { chunk: Int16Array<ArrayBuffer>; at: number; capturedAt: number; level: number }
  let held: Held[] = []
  let sockets = 0
  let ahead: { at: number; token: ReturnType<SpeechInputOptions['getToken']> } | null = null
  const loud = createLoudDetector(() => opts.onLoud?.())
  const trace = opts.trace
  const now = opts.now ?? Date.now
  const clock = createStreamClock()
  const timed = (words: ServiceWord[]): HeardWord[] =>
    words.map(w => ({ text: w.text, at: clock.capturedAt(w.start), endAt: clock.capturedAt(w.end) }))

  /** A token for the next socket, fetched while this one runs: changing sockets then waits on no network. */
  const fetchAhead = () => {
    const token = opts.getToken()
    token.catch(() => undefined)
    ahead = { at: now(), token }
  }
  /** Keeps the token for the next socket fresh, so changing sockets never waits on hq. */
  const keepAheadFresh = () => { if (ahead && now() - ahead.at >= TOKEN_REFRESH_MS) fetchAhead() }
  const takeAhead = () => {
    const a = ahead
    ahead = null
    return a && now() - a.at < TOKEN_FRESH_MS ? a.token : undefined
  }

  const connect = async (tokenAhead?: ReturnType<SpeechInputOptions['getToken']>) => {
    // A token fetched ahead that failed is fetched again, once.
    const { token, config } = await (tokenAhead?.catch(() => opts.getToken()) ?? opts.getToken())
    if (stopped) return
    trace?.mark('token')
    const mine = {}
    attempt = mine
    conn = null
    const orderBase = ORDER_PER_SOCKET * sockets++
    const order = (o: number | null) => (o === null ? null : orderBase + o)
    const handlers: SpeechToTextHandlers = {
      onWords(text, words, committed, turn) {
        if (attempt !== mine || muted) return
        if (committed) opts.onTurn(text, order(turn), timed(words))
        else opts.onPartial(text, order(turn), timed(words))
      },
      onError(message) {
        if (attempt !== mine || muted) return
        opts.onFail(`Speech to text stopped: ${message}.`)
      },
      onClose() {
        if (stopped || attempt !== mine) return
        // Audio is held again until the next socket opens.
        conn = null
        if (reconnects++ >= MAX_RECONNECTS) { opts.onFail('Speech to text stopped working.'); return }
        // Unless the socket was changed for a fresh one meanwhile.
        setTimeout(() => { if (!stopped && attempt === mine) connect(takeAhead()).catch(() => opts.onFail('Speech to text could not be reached.')) }, 500)
      },
    }
    const onOpen = (opened: SpeechToTextConnection) => {
      // Changed for a fresh one, or stopped, while it opened.
      if (attempt !== mine) { opened.close(); return }
      trace?.mark('socket open')
      conn = opened
      clock.reset()
      for (const h of held) sendNow(opened, h.chunk, h.at, h.capturedAt, h.level)
      held = []
      fetchAhead()
    }
    void assemblyAi({ token, config: { ...config, ...opts.config }, trace, onOpen }).connect(handlers)
  }

  const joinPending = (): Int16Array<ArrayBuffer> => {
    const joined = new Int16Array(pendingBytes / 2)
    let at = 0
    for (const p of pending) { joined.set(p, at); at += p.length }
    pending = []
    pendingBytes = 0
    return joined
  }

  const sendNow = (to: SpeechToTextConnection, chunk: Int16Array<ArrayBuffer>, at: number, capturedAt: number, level: number) => {
    to.send(chunk)
    clock.sent(msOf(chunk), capturedAt)
    trace?.sent(msOf(chunk), at, level, to.bufferedMs() * 2 * (SPEECH_RATE / 1000))
  }

  const closeSocket = () => {
    const open = conn
    attempt = null
    conn = null
    open?.close()
  }

  const send = (chunk: Int16Array<ArrayBuffer>, level: number) => {
    const at = trace ? trace.now() : 0
    const capturedAt = now()
    keepAheadFresh()
    if (conn) sendNow(conn, chunk, at, capturedAt, level)
    else if (!stopped) {
      held.push({ chunk, at, capturedAt, level })
      if (held.length > HELD_CHUNKS) trace?.dropped(msOf(held.shift()!.chunk))
    }
  }

  const onAudio = (pcm: Int16Array<ArrayBuffer>) => {
    pending.push(pcm)
    pendingBytes += pcm.byteLength
    if (pendingBytes < CHUNK_BYTES) return
    const joined = joinPending()
    if (muted) return
    const level = rms(joined)
    if (opts.watchLoud?.()) loud(level)
    send(joined, level)
  }

  return {
    async start() {
      stopped = false
      // The token is fetched while the microphone opens; audio from then on is held until the socket is open.
      const tokenAhead = opts.getToken()
      tokenAhead.catch(() => undefined)
      const opened = await openMicrophone(onAudio, trace)
      // Stopped while the microphone was opening: it is closed again at once, not left listening.
      if (stopped) { opened.stop(); return }
      mic = opened
      await connect(tokenAhead)
    },
    stop() {
      trace?.mark('stop')
      stopped = true
      closeSocket()
      mic?.stop()
      mic = null; pending = []; pendingBytes = 0; held = []; ahead = null
    },
    setMuted(value) { muted = value },
    endTurn() {
      if (pendingBytes > 0 && !muted) send(joinPending(), 0)
      conn?.endTurn()
    },
  }
}
