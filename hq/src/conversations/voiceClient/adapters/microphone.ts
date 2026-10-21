/**
 * The microphone, after the browser's processing (acoustic spec, §1): opened through `getUserMedia` with the
 * device's own echo cancellation, noise suppression and automatic gain on, read through an AudioWorklet, made
 * 16 kHz mono PCM16 whatever rate the device runs at, and handed on as it comes. `audioFrames` turns that audio
 * into the runtime's `audio.frame` events, 512 samples (32 ms) each; the `microphone` adapter does both, and
 * publishes the device check's `acoustic.device`.
 */
import type { Adapter, VoiceRuntimeHandle } from '../runtime/types'
import { createResampler, SPEECH_RATE } from '../resample'
import type { SpeechTrace } from '../speechTiming'
import { watchDevice, type MediaDevicesLike, type TrackSettings } from './device'
import { getUserMedia, mediaDevices, SECURE_PAGE_WORDS } from '../../../shared/securePage'

export const FRAME_SAMPLES = 512

export type Microphone = {
  stop: () => void
  /** What the browser granted the microphone's track. */
  settings: () => TrackSettings
  /** The rate the audio context runs at, before the audio is made 16 kHz. */
  contextRate: number
}

export const MICROPHONE_CONSTRAINTS: MediaTrackConstraints = {
  sampleRate: { ideal: 16000 },
  channelCount: { ideal: 1 },
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

function toPcm16(float32: Float32Array): Int16Array<ArrayBuffer> {
  const out = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const c = Math.max(-1, Math.min(1, float32[i]!))
    out[i] = c < 0 ? c * 0x8000 : c * 0x7fff
  }
  return out
}

/** What the person is told when the browser refuses the microphone, by the reason it gives. */
export function microphoneProblem(err: unknown): string {
  const name = err instanceof Error || (typeof err === 'object' && err !== null) ? (err as { name?: string }).name : undefined
  switch (name) {
    case 'SecurePageNeeded':
      return SECURE_PAGE_WORDS
    case 'NotAllowedError':
    case 'SecurityError':
      return "The microphone is blocked. Allow it for this site in the browser, and for the browser in your computer's privacy settings, or keep typing."
    case 'NotReadableError':
    case 'AbortError':
      return 'The microphone is in use by another app or tab, or could not be started. Close the other one and try again, or keep typing.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return "No microphone was found. Connect one, or choose it in your computer's sound settings, or keep typing."
    default:
      return `The microphone could not be used${name ? ` (${name})` : ''}. Allow it for this site, or keep typing.`
  }
}

/** Opens the microphone; `onAudio` gets each piece of it as the worklet posts it. */
export async function openMicrophone(onAudio: (pcm: Int16Array<ArrayBuffer>) => void, trace?: SpeechTrace): Promise<Microphone> {
  let stream: MediaStream
  try {
    stream = await getUserMedia({ audio: MICROPHONE_CONSTRAINTS })
  } catch (err) {
    console.warn('[voice] the browser refused the microphone', err)
    throw new Error(microphoneProblem(err))
  }
  trace?.mark('microphone')
  const ctx = new AudioContext({ sampleRate: SPEECH_RATE })
  // Asked for 16 kHz, a context may still run at the device's rate: what is handed on is made 16 kHz either way.
  const resample = createResampler(ctx.sampleRate)
  trace?.audio(ctx.sampleRate, stream.getAudioTracks?.()[0]?.getSettings() as Record<string, unknown> ?? null)
  await ctx.audioWorklet.addModule('/pcm-processor.js')
  const node = new AudioWorkletNode(ctx, 'pcm-processor')
  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => onAudio(toPcm16(resample(new Float32Array(e.data))))
  ctx.createMediaStreamSource(stream).connect(node)
  node.connect(ctx.destination)
  const track = stream.getAudioTracks?.()[0]
  return {
    settings: () => (track?.getSettings() ?? {}) as TrackSettings,
    contextRate: ctx.sampleRate,
    stop() {
      node.disconnect()
      void ctx.close().catch(() => undefined)
      stream.getTracks().forEach(t => t.stop())
    },
  }
}

/** Cuts audio, in pieces of any size, into `audio.frame` events, carrying what is left to the next piece. */
export function audioFrames(runtime: VoiceRuntimeHandle): (pcm: Int16Array) => void {
  let carry = new Int16Array(0)
  return (pcm) => {
    const all = new Int16Array(carry.length + pcm.length)
    all.set(carry)
    all.set(pcm, carry.length)
    let at = 0
    for (; at + FRAME_SAMPLES <= all.length; at += FRAME_SAMPLES) {
      runtime.publish({ kind: 'audio.frame', pcm: all.slice(at, at + FRAME_SAMPLES), t: runtime.now() })
    }
    carry = all.slice(at)
  }
}

export type MicrophoneDeps = {
  open?: (onAudio: (pcm: Int16Array<ArrayBuffer>) => void) => Promise<Microphone>
  media?: MediaDevicesLike | null
  /** The microphone is open. */
  opened?: () => void
  /** The microphone could not be opened. */
  failed?: (err: unknown) => void
}

/**
 * The microphone as an adapter: `audio.frame` as the person speaks, and `acoustic.device` once it is open. While
 * the person has muted it (`stt.muted`), nothing they say is heard: no frames are published.
 */
export function microphone(deps: MicrophoneDeps = {}): Adapter {
  const open = deps.open ?? (onAudio => openMicrophone(onAudio))
  return {
    name: 'microphone',
    start(runtime) {
      let stopped = false
      let muted = false
      let close: (() => void) | null = null
      const frames = audioFrames(runtime)
      const offMuted = runtime.subscribe(['stt.muted'], e => { muted = e.muted })
      open(pcm => { if (!muted) frames(pcm) }).then((mic) => {
        if (stopped) { mic.stop(); return }
        const media = deps.media !== undefined ? deps.media : (mediaDevices() as unknown as MediaDevicesLike | null)
        const unwatch = watchDevice(runtime, mic.settings, mic.contextRate, media)
        close = () => { unwatch(); mic.stop() }
        deps.opened?.()
      }, (err: unknown) => { if (!stopped) deps.failed?.(err) })
      return () => { stopped = true; offMuted(); close?.(); close = null }
    },
  }
}
