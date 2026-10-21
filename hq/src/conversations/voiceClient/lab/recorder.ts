/**
 * What a recording session keeps: the microphone's audio after the browser's processing, and what the page played at
 * the same moment, both at 16 kHz and on one timeline, so the two files line up sample for sample. Pure: the page
 * feeds it audio and says when each clip started; it holds no timer, microphone or audio context.
 */
import { toPcm16 } from './wav'

export const RECORDING_RATE = 16000

export type ClipPlayed = { label: string; atMs: number; durationMs: number }

export type Timeline = {
  format: 'voice-recording'
  version: 1
  sampleRate: number
  startedAt: string
  durationMs: number
  /** What the browser reports it applied to the microphone. */
  processing: Record<string, unknown> | null
  /** The delay between a sample being played and leaving the speakers, as the browser reports it. */
  outputLatencyMs: number | null
  clips: ClipPlayed[]
}

export type RecordingMeta = { startedAt: string; processing: Record<string, unknown> | null; outputLatencyMs: number | null }
export type Finished = { mic: Int16Array; agent: Int16Array; timeline: Timeline }

const ms = (samples: number) => Math.round((samples / RECORDING_RATE) * 1000)

export function createRecorder() {
  const chunks: Float32Array[] = []
  let micSamples = 0
  const clips: { label: string; atSample: number; samples: Float32Array }[] = []

  return {
    addMic(chunk: Float32Array) {
      chunks.push(chunk)
      micSamples += chunk.length
    },
    /** Microphone samples kept so far: where on the timeline a clip that starts now belongs. */
    position: () => micSamples,
    addClip(label: string, atSample: number, samples: Float32Array) {
      clips.push({ label, atSample, samples })
    },
    finish(meta: RecordingMeta): Finished {
      const mic = new Float32Array(micSamples)
      let at = 0
      for (const c of chunks) { mic.set(c, at); at += c.length }
      const agent = new Float32Array(micSamples)
      for (const clip of clips) {
        for (let i = 0; i < clip.samples.length && clip.atSample + i < agent.length; i++) agent[clip.atSample + i]! += clip.samples[i]!
      }
      return {
        mic: toPcm16(mic),
        agent: toPcm16(agent),
        timeline: {
          format: 'voice-recording',
          version: 1,
          sampleRate: RECORDING_RATE,
          startedAt: meta.startedAt,
          durationMs: ms(micSamples),
          processing: meta.processing,
          outputLatencyMs: meta.outputLatencyMs,
          clips: clips.map((c) => ({ label: c.label, atMs: ms(c.atSample), durationMs: ms(c.samples.length) })),
        },
      }
    },
  }
}
