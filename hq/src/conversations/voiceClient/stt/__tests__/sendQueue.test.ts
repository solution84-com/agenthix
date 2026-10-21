import { describe, expect, it } from 'vitest'
import { capQueue, leaveOutSilence, msOf, paced, resumeFrom, type Frame } from '../sendQueue'

const frame = (i: number, speech: boolean): Frame => ({ pcm: new Int16Array(512), t: (i + 1) * 32, ms: 32, speech })
const frames = (pattern: string) => [...pattern].map((c, i) => frame(i, c === 'S'))
const pattern = (fs: Frame[]) => fs.map(f => (f.speech ? 'S' : '.')).join('')

describe('the send queue', () => {
  it('leaves out silence, never speech: each run of silence is cut to the 300 ms before what follows', () => {
    const queue = frames(`${'.'.repeat(30)}SSSS${'.'.repeat(20)}SS${'.'.repeat(4)}`)
    const out = leaveOutSilence(queue, 300)
    expect(pattern(out)).toBe(`${'.'.repeat(10)}SSSS${'.'.repeat(10)}SS....`)
    // The audio kept is the audio just before the speech, in order.
    expect(out[0]!.t).toBe(queue[20]!.t)
    expect(out.filter(f => f.speech)).toEqual(queue.filter(f => f.speech))
  })

  it('gives a fresh connection the audio from the point it resumes at, less the preroll, silence left out', () => {
    const held = frames(`${'.'.repeat(40)}SSSSSSSS${'.'.repeat(40)}`)
    const from = held[40]!.t - 32 // the start of the first word
    const out = resumeFrom(held, from, 300)
    expect(pattern(out)).toBe(`${'.'.repeat(10)}SSSSSSSS${'.'.repeat(10)}`)
    expect(out[0]!.t).toBeGreaterThan(from - 300)
  })

  it('caps the queue far beyond its limit: silence first, then the oldest audio, saying how much speech went', () => {
    const queue = frames(`SSSS${'.'.repeat(100)}SSSS`)
    expect(capQueue(queue, 10_000, 300).frames).toBe(queue)
    const silenceGone = capQueue(queue, 1_000, 300)
    expect(silenceGone.lostSpeechMs).toBe(0)
    expect(msOf(silenceGone.frames)).toBe(18 * 32)
    const speechGone = capQueue(queue, 4 * 32, 300)
    expect(speechGone.lostSpeechMs).toBe(4 * 32)
    expect(pattern(speechGone.frames)).toBe('SSSS')
  })

  it('sends at the pace of speech: only as much as real time has passed, and never a burst', () => {
    let pace = paced({ budgetMs: 0, at: null }, 0)
    expect(pace.budgetMs).toBe(64)
    pace = paced({ ...pace, budgetMs: 0 }, 32)
    expect(pace.budgetMs).toBe(32)
    pace = paced(pace, 10_000)
    expect(pace.budgetMs).toBe(64)
  })

  it('catches up a backlog at a multiple of that pace', () => {
    const pace = paced({ budgetMs: 0, at: 0 }, 32, 2)
    expect(pace.budgetMs).toBe(64)
    expect(paced(pace, 10_000, 2).budgetMs).toBe(128)
  })
})
