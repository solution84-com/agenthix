import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VOICE_SETTINGS } from '../../voiceClient/settings'
import { phraseClips, fillerPhrases, PHRASE_DIRECTION, storedPhrases, withoutTail, type PhraseClip } from '../phrases'

const voice = { apiKey: 'k', voiceId: 'Ashley', model: 'm', providerId: 'p1' }
const random = () => 0
const PHRASES = storedPhrases(random).map(p => p.text)
let dir: string

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phrases-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

async function collect(synthesize: (text: string) => Promise<Buffer>, v = voice, stillWanted?: () => boolean) {
  const clips: PhraseClip[] = []
  await phraseClips(v, c => clips.push(c), stillWanted, { synthesize, dir: () => dir, random })
  return clips
}

describe('the stored phrases @SC-1832 @SC-1833', () => {
  it('mix an opening and an ending, each in only one, for the first step with none of its own, drawn afresh each time', () => {
    const { steps, mix } = VOICE_SETTINGS.filler
    const tier = steps.findIndex(s => s.phrases.length === 0)
    const mixes = fillerPhrases().filter(p => p.tier === tier).map(p => p.text)
    expect(mixes).toHaveLength(mix.perSession)
    const opening = (m: string) => mix.openings.find(o => m.startsWith(`${o} `))
    const ending = (m: string) => mix.endings.find(e => m.endsWith(` ${e}`))
    expect(new Set(mixes.map(opening)).size).toBe(mixes.length)
    expect(new Set(mixes.map(ending)).size).toBe(mixes.length)
    expect(mixes.every(m => m === `${opening(m)} ${ending(m)}`)).toBe(true)
    const draws = new Set(Array.from({ length: 5 }, () => fillerPhrases().filter(p => p.tier === tier).map(p => p.text).join('|')))
    expect(draws.size).toBeGreaterThan(1)
    expect(fillerPhrases().filter(p => p.tier !== tier).map(p => p.text)).toEqual(steps.flatMap(s => s.phrases))
  })

  it('are made one at a time, in the voice’s own voice, and kept on disk', async () => {
    let running = 0
    let most = 0
    const synthesize = vi.fn(async (text: string) => {
      most = Math.max(most, ++running)
      await new Promise(r => setTimeout(r, 1))
      running--
      return Buffer.from(text)
    })
    const clips = await collect(synthesize)
    expect(clips.map(c => c.text)).toEqual(PHRASES)
    expect(clips[0]!.tier).toBe(0)
    expect(clips.at(-1)!.tier).toBe(VOICE_SETTINGS.filler.steps.length - 1)
    const L = VOICE_SETTINGS.listening
    const ofTier = (use: string, tier: number) => clips.filter(c => c.use === use && c.tier === tier).map(c => c.text)
    const once = (list: string[]) => [...new Set(list)]
    expect(once(ofTier('active-listening', 1))).toEqual(L.hums)
    expect(once(ofTier('active-listening', 2))).toEqual(L.acknowledging)
    expect(once(ofTier('encouragement', 3))).toEqual(L.invitations)
    expect(most).toBe(1)
    const made = synthesize.mock.calls.length
    await collect(synthesize)
    expect(synthesize).toHaveBeenCalledTimes(made)
    await collect(synthesize, { ...voice, voiceId: 'Other' })
    expect(synthesize).toHaveBeenCalledTimes(made * 2)
  })

  it('leave out a phrase that could not be made, and try it again next time', async () => {
    const [first] = PHRASES
    const failing = async (text: string) => { if (text === first) throw new Error('down'); return Buffer.from(text) }
    expect((await collect(failing)).map(c => c.text)).not.toContain(first)
    const working = vi.fn(async (text: string) => Buffer.from(text))
    expect((await collect(working)).map(c => c.text)).toContain(first)
    expect(working).toHaveBeenCalledTimes(1)
  })

  it('are made with a relaxed direction on a model that takes one, and as written on one that does not', async () => {
    const asked: string[] = []
    const synthesize = async (text: string) => { asked.push(text); return Buffer.from(text) }
    const directed = await collect(synthesize, { ...voice, model: 'inworld-tts-2' })
    expect(directed.map(c => c.text)).toEqual(PHRASES)
    // Fillers take the one direction; each listening clip takes its own, so the same words come in different tones.
    const L = VOICE_SETTINGS.listening
    const own = [...L.directions.hums, ...L.directions.acknowledging, ...L.directions.invitations]
    expect(asked.every(t => t.startsWith(`${PHRASE_DIRECTION} `) || own.some(d => (d ? t.startsWith(`${d} `) : [...L.hums, ...L.acknowledging, ...L.invitations].includes(t))))).toBe(true)
    // Hums, words and invitations are all spoken plain.
    expect(asked).toContain('Mm-hm.')
    // An empty direction leaves the words as written.
    expect(asked).toContain('I see.')
    asked.length = 0
    await collect(synthesize, { ...voice, model: 'inworld-tts-2' })
    expect(asked.some(t => t.startsWith('['))).toBe(false)
  })

  it('hold the listening family in its three tiers, as the spec words them, with none that agrees or judges', () => {
    const L = VOICE_SETTINGS.listening
        expect(L.invitations.length).toBeGreaterThanOrEqual(10)
    // Five sounds and five words; each text is made in as many tones as `tonesPerText` says, from its tier's directions.
    expect(L.hums.length).toBeGreaterThanOrEqual(8)
    expect(L.acknowledging).toHaveLength(5)
    expect(L.tonesPerText).toBeGreaterThanOrEqual(1)
    for (const word of ['I see.', 'Right.', 'Got it.', 'Okay.']) expect(L.acknowledging).toContain(word)
    for (const word of ['Go on.', "I'm listening.", 'Take your time.', "Whenever you're ready."]) expect(L.invitations).toContain(word)
    const all = [...L.hums, ...L.acknowledging, ...L.invitations].join(' ').toLowerCase()
    for (const left of ['sure', 'makes sense', 'good point', 'interesting']) expect(all).not.toContain(left)
  })

  it('stop being made once voice has ended', async () => {
    let wanted = true
    const synthesize = vi.fn(async (text: string) => { wanted = false; return Buffer.from(text) })
    expect(await collect(synthesize, voice, () => wanted)).toEqual([])
    expect(synthesize).toHaveBeenCalledTimes(1)
  })

  it('trim the silence a listening clip ends with, and keep what is spoken', () => {
    const rate = 24_000
    const samples = new Int16Array(rate)
    for (let i = 2_000; i < 12_000; i++) samples[i] = Math.round(Math.sin(i / 6) * 8_000)
    const kept = withoutTail(Buffer.from(samples.buffer))
    expect(kept.length / 2).toBeLessThan(12_000 + rate * 0.1)
    expect(kept.length / 2).toBeGreaterThanOrEqual(12_000)
    const silent = Buffer.alloc(2_000)
    expect(withoutTail(silent)).toBe(silent)
  })
})
