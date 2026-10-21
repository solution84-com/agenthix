// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createRecorder, RECORDING_RATE } from '../recorder'
import { RecordingPanel } from '../RecordingPanel'
import { encodeWav, toPcm16 } from '../wav'

afterEach(cleanup)

describe('encodeWav', () => {
  it('writes a 16 kHz mono 16-bit PCM file the samples can be read back from', () => {
    const pcm = Int16Array.from([0, 1000, -1000, 32767, -32768])
    const wav = encodeWav(pcm, 16000)
    const view = new DataView(wav.buffer)
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF')
    expect(new TextDecoder().decode(wav.subarray(8, 12))).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(pcm.length * 2)
    expect(wav.length).toBe(44 + pcm.length * 2)
    expect(Array.from({ length: 5 }, (_, i) => view.getInt16(44 + 2 * i, true))).toEqual(Array.from(pcm))
  })

  it('clips samples beyond full scale', () => {
    expect(Array.from(toPcm16(Float32Array.from([2, -2, 0])))).toEqual([32767, -32768, 0])
  })
})

describe('createRecorder', () => {
  const meta = { startedAt: '2026-10-19T10:00:00.000Z', processing: null, outputLatencyMs: null }

  it('keeps both tracks the same length, with the clip where it started', () => {
    const recorder = createRecorder()
    recorder.addMic(new Float32Array(RECORDING_RATE)) // 1 s
    recorder.addClip('reply.m4a', recorder.position(), new Float32Array(8000).fill(0.5))
    recorder.addMic(new Float32Array(RECORDING_RATE)) // 2 s in all
    const { mic, agent, timeline } = recorder.finish(meta)
    expect(mic.length).toBe(2 * RECORDING_RATE)
    expect(agent.length).toBe(mic.length)
    expect(agent[RECORDING_RATE - 1]).toBe(0)
    expect(agent[RECORDING_RATE]).toBeGreaterThan(16000)
    expect(agent[RECORDING_RATE + 8000]).toBe(0)
    expect(timeline).toMatchObject({ format: 'voice-recording', sampleRate: 16000, durationMs: 2000, clips: [{ label: 'reply.m4a', atMs: 1000, durationMs: 500 }] })
  })

  it('cuts a clip that outlasts the recording, and adds clips that overlap', () => {
    const recorder = createRecorder()
    recorder.addMic(new Float32Array(100))
    recorder.addClip('a', 90, new Float32Array(50).fill(0.25))
    recorder.addClip('b', 90, new Float32Array(50).fill(0.25))
    const { agent } = recorder.finish(meta)
    expect(agent.length).toBe(100)
    expect(agent[89]).toBe(0)
    expect(agent[95]).toBe(toPcm16(Float32Array.from([0.5]))[0])
  })
})

describe('RecordingPanel', () => {
  it('offers recording, and nothing to save or play before there is one', () => {
    render(<RecordingPanel />)
    expect(screen.getByText('Not recording')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save the files' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeTruthy()
  })
})
