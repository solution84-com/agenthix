import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSING_PHRASES, HOLD_PHRASES, holdPhraseClip, storedPhraseClip, warmHoldPhrases } from '../phrases'
import { countWords } from '../listener'

const voice = { apiKey: 'k', voiceId: 'Ashley', model: 'm', providerId: 'p1' }
let dir: string

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holds-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('the stored hold phrases @SC-2211', () => {
  it('are a pool of about forty short, different, generic lines', () => {
    expect(HOLD_PHRASES.length).toBeGreaterThanOrEqual(38)
    expect(new Set(HOLD_PHRASES).size).toBe(HOLD_PHRASES.length)
    expect(HOLD_PHRASES.every(p => countWords(p) <= 7)).toBe(true)
    // Generic: none names an answer, a result or a promise of one.
    expect(HOLD_PHRASES.filter(p => /\b(done|ready|found|yes|no|sure|will)\b/i.test(p))).toEqual([])
  })

  it('are made once each, one at a time, and kept on disk, with the closing lines; no backchannel library any more @SC-2237', async () => {
    const synthesize = vi.fn(async (text: string) => Buffer.from(text))
    await warmHoldPhrases(voice, () => true, { synthesize, dir: () => dir })
    const all = HOLD_PHRASES.length + CLOSING_PHRASES.length
    expect(synthesize).toHaveBeenCalledTimes(all)
    expect(synthesize.mock.calls.map(c => c[0])).toEqual([...HOLD_PHRASES, ...CLOSING_PHRASES])
    await warmHoldPhrases(voice, () => true, { synthesize, dir: () => dir })
    expect(synthesize).toHaveBeenCalledTimes(all)
  })

  it('never repeat a recent one, and play one already made without making it', async () => {
    const synthesize = vi.fn(async (text: string) => Buffer.from(text))
    await warmHoldPhrases(voice, () => true, { synthesize, dir: () => dir })
    synthesize.mockClear()
    const avoid: string[] = []
    for (let i = 0; i < 8; i++) {
      const clip = await holdPhraseClip(voice, avoid, { synthesize, dir: () => dir })
      expect(clip).not.toBeNull()
      expect(avoid).not.toContain(clip!.text)
      avoid.push(clip!.text)
    }
    expect(synthesize).not.toHaveBeenCalled()
  })

  it('make one at once when none is made yet; null when none can be', async () => {
    const made = await holdPhraseClip(voice, [], { synthesize: async t => Buffer.from(t), dir: () => dir, random: () => 0 })
    expect(made?.audio.toString()).toBe(made?.text)
    const none = await holdPhraseClip({ ...voice, voiceId: 'Other' }, [], { synthesize: async () => { throw new Error('down') }, dir: () => dir })
    expect(none).toBeNull()
  })
})

describe('the stored closing lines @SC-2206', () => {
  it('are a small set of short, different lines that ask nothing and say nothing went wrong', () => {
    expect(CLOSING_PHRASES.length).toBeGreaterThanOrEqual(5)
    expect(new Set(CLOSING_PHRASES).size).toBe(CLOSING_PHRASES.length)
    expect(CLOSING_PHRASES.every(p => countWords(p) <= 7)).toBe(true)
    expect(CLOSING_PHRASES.filter(p => /\?|wrong|lost|cut|okay\?|alright\?/i.test(p))).toEqual([])
    expect(CLOSING_PHRASES.filter(p => HOLD_PHRASES.includes(p))).toEqual([])
  })

  it('are drawn from their own pool, none of the recent ones repeated, made on first use and kept', async () => {
    const synthesize = vi.fn(async (text: string) => Buffer.from(text))
    const first = await storedPhraseClip(voice, 'closing', [], { synthesize, dir: () => dir, random: () => 0 })
    expect(CLOSING_PHRASES).toContain(first!.text)
    expect(synthesize).toHaveBeenCalledTimes(1)
    const again = await storedPhraseClip(voice, 'closing', [], { synthesize, dir: () => dir, random: () => 0 })
    expect(again!.text).toBe(first!.text)
    expect(synthesize).toHaveBeenCalledTimes(1)
    const other = await storedPhraseClip(voice, 'closing', [first!.text], { synthesize, dir: () => dir, random: () => 0 })
    expect(other!.text).not.toBe(first!.text)
    expect(CLOSING_PHRASES).toContain(other!.text)
  })
})
