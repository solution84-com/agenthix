import { describe, expect, it } from 'vitest'
import type { PacerClock } from '../pacer'
import { replayMicrophone } from '../replayMic'
import { createReplayStore } from '../replayState'
import { parseWav } from '../wav'

function wavBytes(samples: Int16Array, rate = 16000, channels = 1): ArrayBuffer {
  const b = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const tag = (at: number, s: string) => [...s].forEach((c, i) => b.setUint8(at + i, c.charCodeAt(0)))
  tag(0, 'RIFF'); b.setUint32(4, 36 + samples.length * 2, true); tag(8, 'WAVE'); tag(12, 'fmt ')
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, channels, true); b.setUint32(24, rate, true)
  b.setUint32(28, rate * 2 * channels, true); b.setUint16(32, 2 * channels, true); b.setUint16(34, 16, true)
  tag(36, 'data'); b.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => b.setInt16(44 + i * 2, s, true))
  return b.buffer
}

function fakeClock() {
  let t = 0
  let fn: (() => void) | null = null
  const clock: PacerClock = { now: () => t, every: (f) => { fn = f; return () => { fn = null } } }
  return { clock, advance(ms: number) { for (let i = 0; i < ms / 20; i++) { t += 20; fn?.() } } }
}

describe('the wav reader', () => {
  it('reads 16-bit mono samples and the rate', () => {
    const w = parseWav(wavBytes(Int16Array.from([1, -2, 3]), 16000))
    expect(Array.from(w.pcm)).toEqual([1, -2, 3])
    expect(w.rate).toBe(16000)
  })
  it('refuses what is not a mono 16-bit WAV', () => {
    expect(() => parseWav(new ArrayBuffer(100))).toThrow('Not a WAV')
    expect(() => parseWav(wavBytes(new Int16Array(4), 16000, 2))).toThrow('16-bit PCM, mono')
  })
  it('reads what is there when the data size claims more', () => {
    const b = wavBytes(Int16Array.from([5, 6, 7, 8]))
    new DataView(b).setUint32(40, 9999, true)
    expect(Array.from(parseWav(b).pcm)).toEqual([5, 6, 7, 8])
  })
})

describe('the replay microphone', () => {
  const rec = parseWav(wavBytes(new Int16Array(16000).fill(7)))

  it('refuses to open with no recording chosen', async () => {
    const store = createReplayStore()
    await expect(replayMicrophone({ store, load: async () => rec })(() => undefined)).rejects.toThrow('No recording chosen')
    expect(store.get().status).toBe('error')
  })

  it('plays the recording in real time, reports its position, and finishes', async () => {
    const f = fakeClock()
    const store = createReplayStore()
    store.set({ file: 'a.wav' })
    let heard = 0
    const mic = await replayMicrophone({ store, load: async () => rec, clock: f.clock, tailMs: 100 })(pcm => { heard += pcm.length })
    expect(mic.contextRate).toBe(16000)
    expect(store.get().status).toBe('playing')
    f.advance(500)
    expect(heard).toBe(8000)
    expect(store.get().positionMs).toBeCloseTo(500)
    f.advance(1000)
    expect(heard).toBe(16000 + 1600)
    expect(store.get().status).toBe('finished')
  })

  it('stops on request, and plays the agent recording alongside until then', async () => {
    const f = fakeClock()
    const store = createReplayStore()
    store.set({ file: 'a.wav', agentFile: 'b.wav' })
    const events: string[] = []
    const mic = await replayMicrophone({
      store, load: async n => { events.push(`load ${n}`); return rec }, clock: f.clock,
      playAgent: () => { events.push('agent starts'); return () => { events.push('agent stops') } },
    })(() => undefined)
    f.advance(200)
    mic.stop()
    expect(events).toEqual(['load a.wav', 'load b.wav', 'agent starts', 'agent stops'])
    expect(store.get().status).toBe('stopped')
    const at = store.get().positionMs
    f.advance(1000)
    expect(store.get().positionMs).toBe(at)
  })

  it('refuses a recording that is not 16 kHz', async () => {
    const store = createReplayStore()
    store.set({ file: 'a.wav' })
    const odd = parseWav(wavBytes(new Int16Array(10), 44100))
    await expect(replayMicrophone({ store, load: async () => odd })(() => undefined)).rejects.toThrow('44100 Hz')
    expect(store.get().status).toBe('error')
  })
})
