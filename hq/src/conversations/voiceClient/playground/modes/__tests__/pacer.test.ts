import { describe, expect, it } from 'vitest'
import { createPacer, type PacerClock } from '../pacer'

/** A clock that moves only when told to; `advance` runs the ticks that fall due. */
function fakeClock() {
  let t = 1000
  let fn: (() => void) | null = null
  let every = 0
  const clock: PacerClock = {
    now: () => t,
    every: (f, ms) => { fn = f; every = ms; return () => { fn = null } },
  }
  return {
    clock,
    advance(ms: number) { for (let left = ms; left > 0; left -= every) { t += Math.min(every, left); fn?.() } },
    running: () => fn !== null,
  }
}

const RATE = 16_000
const ramp = (n: number) => Int16Array.from({ length: n }, (_, i) => i + 1)

describe('the pacer', () => {
  it('hands on samples as the clock allows, never ahead of it', () => {
    const f = fakeClock()
    const got: number[] = []
    const p = createPacer({ clock: f.clock, pcm: ramp(RATE), rate: RATE, tailMs: 0, onChunk: c => got.push(c.length) })
    p.start()
    f.advance(500)
    expect(got.reduce((a, b) => a + b, 0)).toBe(8000)
    f.advance(250)
    expect(got.reduce((a, b) => a + b, 0)).toBe(12000)
    expect(p.position().ms).toBeCloseTo(750)
  })

  it('keeps the samples in order and whole', () => {
    const f = fakeClock()
    const all: number[] = []
    const pcm = ramp(4000)
    createPacer({ clock: f.clock, pcm, rate: RATE, tailMs: 0, onChunk: c => all.push(...c) }).start()
    f.advance(400)
    expect(all).toEqual(Array.from(pcm))
  })

  it('keeps a pause a pause: silence in the recording is silence in real time', () => {
    const f = fakeClock()
    const pcm = new Int16Array(RATE * 2) // 1 s of sound, then 1 s of silence
    pcm.fill(1000, 0, RATE)
    const times: Array<{ at: number; loud: boolean }> = []
    let elapsed = 0
    const p = createPacer({ clock: f.clock, pcm, rate: RATE, tailMs: 0, onChunk: c => times.push({ at: elapsed, loud: c.some(x => x !== 0) }) })
    p.start()
    for (let i = 0; i < 100; i++) { f.advance(20); elapsed += 20 }
    const loud = times.filter(t => t.loud)
    expect(Math.max(...loud.map(t => t.at))).toBeLessThanOrEqual(1020)
    // After the sound, only silence arrives, for the next second.
    expect(times.filter(t => t.at > 1020).every(t => !t.loud)).toBe(true)
    expect(times.reduce((n, t) => n + 1, 0)).toBeGreaterThan(40)
  })

  it('catches up after a stalled tick without sending more than is due', () => {
    const f = fakeClock()
    let n = 0
    createPacer({ clock: f.clock, pcm: ramp(RATE), rate: RATE, tailMs: 0, tickMs: 1000, onChunk: c => { n += c.length } }).start()
    f.advance(1000)
    expect(n).toBe(RATE)
  })

  it('sends silence as a tail, then ends and stops its timer', () => {
    const f = fakeClock()
    const chunks: Int16Array[] = []
    let ended = 0
    const p = createPacer({ clock: f.clock, pcm: ramp(1600), rate: RATE, tailMs: 200, onChunk: c => chunks.push(c), onEnd: () => { ended++ } })
    p.start()
    f.advance(100)
    expect(p.finished()).toBe(false)
    f.advance(400)
    const all = chunks.flatMap(c => Array.from(c))
    expect(all.length).toBe(1600 + 3200)
    expect(all.slice(1600).every(x => x === 0)).toBe(true)
    expect(ended).toBe(1)
    expect(p.finished()).toBe(true)
    expect(f.running()).toBe(false)
    expect(p.position().ms).toBeCloseTo(100)
  })

  it('stops on request: nothing more is sent and the end is not announced', () => {
    const f = fakeClock()
    let n = 0
    let ended = false
    const p = createPacer({ clock: f.clock, pcm: ramp(RATE), rate: RATE, tailMs: 0, onChunk: c => { n += c.length }, onEnd: () => { ended = true } })
    p.start()
    f.advance(200)
    p.stop()
    const sent = n
    f.advance(2000)
    expect(n).toBe(sent)
    expect(ended).toBe(false)
  })
})
