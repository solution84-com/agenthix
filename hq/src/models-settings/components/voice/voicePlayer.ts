import { useSyncExternalStore } from 'react'
import { previewVoice } from 'wasp/client/operations'

/** What a sample needs: the provider and voice, and optionally the voice's description and the language to speak. */
export interface SampleRequest { providerId: string; voiceId: string; description?: string; lang?: string }

export interface PlayerBackend {
  /** The sample as base64 audio. */
  fetchAudio(req: SampleRequest): Promise<string>
  /** Starts it and calls `ended` when it finishes; the function returned stops it early. */
  start(audio: string, ended: () => void): () => void
}

const SAMPLE_RATE = 24000

function samplesOf(base64: string): Int16Array {
  const raw = atob(base64)
  let bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  // The service answers a WAV file; the sound starts after its 44-byte header.
  if (raw.startsWith('RIFF')) bytes = bytes.slice(44)
  return new Int16Array(bytes.buffer, 0, bytes.length >> 1)
}

const browserBackend: PlayerBackend = {
  async fetchAudio(req) {
    return (await previewVoice(req)).audio
  },
  start(audio, ended) {
    const samples = samplesOf(audio)
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    const buffer = ctx.createBuffer(1, Math.max(samples.length, 1), SAMPLE_RATE)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.onended = () => { void ctx.close(); ended() }
    source.start()
    return () => { source.onended = null; try { source.stop() } catch { /* already stopped */ } void ctx.close() }
  },
}

/** The key a sample is lit and cached under. */
export const sampleKey = (providerId: string, voiceId: string) => `${providerId}:${voiceId}`

let backend: PlayerBackend = browserBackend
let playingKey: string | null = null
let stopCurrent: (() => void) | null = null
let turn = 0
const listeners = new Set<() => void>()
const audioCache = new Map<string, string>()

function setPlaying(key: string | null) {
  playingKey = key
  listeners.forEach(l => l())
}

/** Stops whatever is playing; the ▶ that was lit dims. */
export function stopSample() {
  turn++
  stopCurrent?.()
  stopCurrent = null
  setPlaying(null)
}

/** Plays a voice's sample, stopping any other first; playing the same voice again replays it from the start. */
export async function playSample(req: SampleRequest) {
  stopSample()
  const mine = turn
  const key = sampleKey(req.providerId, req.voiceId)
  setPlaying(key)
  try {
    const cacheKey = `${key}:${req.lang ?? 'en'}`
    let audio = audioCache.get(cacheKey)
    if (!audio) {
      audio = await backend.fetchAudio(req)
      audioCache.set(cacheKey, audio)
    }
    if (mine !== turn) return
    stopCurrent = backend.start(audio, () => { if (mine === turn) { stopCurrent = null; setPlaying(null) } })
  } catch {
    // A sample that cannot be made leaves the voice choosable; the ▶ simply dims.
    if (mine === turn) setPlaying(null)
  }
}

/** The key of the voice playing now, or null. */
export function usePlayingKey(): string | null {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => playingKey,
  )
}

/** For tests: swaps what fetches and plays audio, and forgets what was cached. */
export function setBackendForTests(next: PlayerBackend | null) {
  stopSample()
  audioCache.clear()
  backend = next ?? browserBackend
}
