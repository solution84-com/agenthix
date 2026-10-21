import { describe, expect, it } from 'vitest'
import { createPlayback, gainOf, timelineSlice } from '../playback'

type Ramp = { kind: 'set' | 'ramp'; value: number; at: number }

/** Just enough of an AudioContext to see what playback schedules; the test moves `currentTime`. */
function fakeContext() {
  const ramps: Ramp[][] = []
  const ctx = {
    currentTime: 0,
    destination: {},
    createGain() {
      const log: Ramp[] = []
      ramps.push(log)
      const param = {
        value: 1,
        setValueAtTime(value: number, at: number) { log.push({ kind: 'set', value, at }); param.value = value },
        linearRampToValueAtTime(value: number, at: number) { log.push({ kind: 'ramp', value, at }) },
        cancelScheduledValues() { /* nothing scheduled here */ },
      }
      return { gain: param, connect() { /* wired */ } }
    },
    createBuffer(_channels: number, length: number, rate: number) {
      const data = new Float32Array(length)
      return { duration: length / rate, getChannelData: () => data }
    },
    createBufferSource() {
      return { buffer: null, connect() { /* wired */ }, start() { /* scheduled */ }, stop() { /* stopped */ }, onended: null }
    },
    close: () => Promise.resolve(),
  }
  // The master gain is the first one made.
  return { ctx, master: () => ramps[0]! }
}

const tone = (samples: number, value = 0x4000) => new Int16Array(samples).fill(value).buffer

describe('ducking the reply @SC-997', () => {
  it('lowers everything by the duck level within the ramp, and back up on resume', () => {
    const { ctx, master } = fakeContext()
    const playback = createPlayback(() => ctx as unknown as AudioContext)
    playback.enqueue(0, tone(24_000))
    ctx.currentTime = 0.5
    playback.duck!(15, 50)
    expect(master().at(-1)).toEqual({ kind: 'ramp', value: gainOf(15), at: 0.55 })
    ctx.currentTime = 1.2
    playback.resume!(300)
    expect(master().at(-1)).toEqual({ kind: 'ramp', value: 1, at: 1.5 })
  })

  it('is about 15 dB down', () => {
    expect(20 * Math.log10(gainOf(15))).toBeCloseTo(-15, 5)
  })
})

describe('what went to the speaker, for the echo check @SC-997', () => {
  it('slices the timeline, silence where nothing was scheduled', () => {
    const scheduled = [{ start: 1, samples: Float32Array.from([1, 2, 3]) }]
    expect([...timelineSlice(scheduled, 0.5, 5, 4)]).toEqual([0, 0, 1, 2, 3])
    expect([...timelineSlice(scheduled, 1.5, 2, 4)]).toEqual([3, 0])
  })

  it('hands back what has played since it was last asked, at 16 kHz and at the level it played', () => {
    const { ctx } = fakeContext()
    const playback = createPlayback(() => ctx as unknown as AudioContext)
    playback.enqueue(0, tone(24_000))
    // The sentence starts after the lead of 0.1 s.
    ctx.currentTime = 0.6
    const first = playback.heardAudio!()
    expect(first.length).toBeGreaterThan(7_900)
    expect(first.length).toBeLessThanOrEqual(8_000)
    expect(Math.abs(first[4_000]! - 0x4000)).toBeLessThan(4)
    playback.duck!(15, 50)
    ctx.currentTime = 0.7
    const ducked = playback.heardAudio!()
    expect(ducked.length).toBeGreaterThan(1_500)
    expect(ducked[800]! / 0x4000).toBeCloseTo(gainOf(15), 2)
    expect(playback.heardAudio!().length).toBe(0)
  })
})
