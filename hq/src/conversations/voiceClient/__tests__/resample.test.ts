import { describe, expect, it } from 'vitest'
import { createResampler } from '../resample'

function sine(rate: number, hz: number, seconds: number): Float32Array {
  return Float32Array.from({ length: rate * seconds }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate))
}

function crossings(x: Float32Array): number {
  let n = 0
  for (let i = 1; i < x.length; i++) if ((x[i - 1]! < 0) !== (x[i]! < 0)) n++
  return n
}

/** Fed the way the audio worklet posts it: 128 frames at a time. */
function feed(resample: (x: Float32Array) => Float32Array, input: Float32Array): Float32Array {
  const parts: Float32Array[] = []
  for (let i = 0; i < input.length; i += 128) parts.push(resample(input.subarray(i, i + 128)))
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

describe('making the microphone’s audio 16 kHz @SC-998', () => {
  it('passes 16 kHz audio through untouched', () => {
    const input = sine(16000, 440, 0.1)
    expect(createResampler(16000)(input)).toBe(input)
  })

  it('turns a context running at 48 kHz into 16 kHz of the same sound and length', () => {
    const out = feed(createResampler(48000), sine(48000, 440, 1))
    expect(Math.abs(out.length - 16000)).toBeLessThanOrEqual(2)
    expect(Math.abs(crossings(out) - 880)).toBeLessThanOrEqual(2)
  })

  it('handles a rate that does not divide evenly (44.1 kHz) across chunks', () => {
    const out = feed(createResampler(44100), sine(44100, 300, 1))
    expect(Math.abs(out.length - 16000)).toBeLessThanOrEqual(2)
    expect(Math.abs(crossings(out) - 600)).toBeLessThanOrEqual(2)
  })

  it('raises a context slower than 16 kHz', () => {
    const out = feed(createResampler(8000), sine(8000, 200, 1))
    expect(Math.abs(out.length - 16000)).toBeLessThanOrEqual(2)
    expect(Math.abs(crossings(out) - 400)).toBeLessThanOrEqual(2)
  })
})
