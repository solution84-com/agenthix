import { useSyncExternalStore } from 'react'
import { speakAnswer } from 'wasp/client/operations'
import { refusalText } from '../../shared/refusal'

/** One answer being read aloud, by its message. */
export type ListenRequest = { conversationId: string; messageId: string }

export interface ListenBackend {
  /** One part of the answer as base64 audio, and how many parts it has. */
  fetchPart(req: ListenRequest & { part: number }): Promise<{ audio: string; parts: number }>
  /** Plays it; `done` settles when it ends or is stopped. */
  play(audio: string): { done: Promise<void>; stop: () => void }
}

/** What the speaker under an answer shows: nothing going on, fetching its first part, reading it, or why it could not. */
export type ListenState = { messageId: string; phase: 'loading' | 'playing' } | { messageId: string; phase: 'failed'; reason: string } | null

const SAMPLE_RATE = 24000

function samplesOf(base64: string): Int16Array {
  const raw = atob(base64)
  let bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  // The provider answers a WAV file; the sound starts after its 44-byte header.
  if (raw.startsWith('RIFF')) bytes = bytes.slice(44)
  return new Int16Array(bytes.buffer, 0, bytes.length >> 1)
}

const browserBackend: ListenBackend = {
  fetchPart: (req) => speakAnswer(req),
  play(audio) {
    const samples = samplesOf(audio)
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    const buffer = ctx.createBuffer(1, Math.max(samples.length, 1), SAMPLE_RATE)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i]! / 32768
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    let finish = () => {}
    const done = new Promise<void>((resolve) => { finish = resolve })
    source.onended = () => { void ctx.close(); finish() }
    source.start()
    return {
      done,
      stop: () => { source.onended = null; try { source.stop() } catch { /* already stopped */ } void ctx.close(); finish() },
    }
  },
}

let backend: ListenBackend = browserBackend
let state: ListenState = null
let turn = 0
let stopCurrent: (() => void) | null = null
const listeners = new Set<() => void>()

function set(next: ListenState) {
  state = next
  listeners.forEach((l) => l())
}

/** Stops the answer being read, if any. */
export function stopListening() {
  turn++
  stopCurrent?.()
  stopCurrent = null
  set(null)
}

/** Reads an answer aloud from its start, part after part, stopping any other first; the next part is fetched while one plays. */
export async function listenTo(req: ListenRequest) {
  stopListening()
  const mine = turn
  set({ messageId: req.messageId, phase: 'loading' })
  try {
    type Part = { audio: string; parts: number }
    let next: Promise<Part> | null = backend.fetchPart({ ...req, part: 0 })
    for (let part = 0; next; part++) {
      const { audio, parts }: Part = await next
      if (mine !== turn) return
      next = part + 1 < parts ? backend.fetchPart({ ...req, part: part + 1 }) : null
      next?.catch(() => undefined)
      const playing = backend.play(audio)
      stopCurrent = playing.stop
      set({ messageId: req.messageId, phase: 'playing' })
      await playing.done
      if (mine !== turn) return
    }
    stopCurrent = null
    set(null)
  } catch (err) {
    if (mine === turn) { stopCurrent = null; set({ messageId: req.messageId, phase: 'failed', reason: refusalText(err) }) }
  }
}

/** The answer being read aloud or fetched now, by its message; null when none. */
export function listeningTo(): string | null {
  return state && state.phase !== 'failed' ? state.messageId : null
}

export function useListenState(): ListenState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => state,
  )
}

/** For tests: swaps what fetches and plays the audio. */
export function setListenBackendForTests(next: ListenBackend | null) {
  stopListening()
  backend = next ?? browserBackend
}
