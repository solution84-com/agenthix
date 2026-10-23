import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VOICE_SETTINGS } from '../../voiceClient/settings'
import { phraseClips, fillerPhrases, PHRASE_DIRECTION, storedPhrases, type PhraseClip } from '../phrases'

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

describe('the stored phrases', () => {
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
    expect(clips.filter(c => c.use === 'active-listening').map(c => c.text)).toEqual(VOICE_SETTINGS.activeListening.phrases)
    expect(clips.filter(c => c.use === 'encouragement').map(c => c.text)).toEqual(VOICE_SETTINGS.encouragement.phrases)
    expect(most).toBe(1)
    await collect(synthesize)
    expect(synthesize).toHaveBeenCalledTimes(new Set(PHRASES).size)
    await collect(synthesize, { ...voice, voiceId: 'Other' })
    expect(synthesize).toHaveBeenCalledTimes(new Set(PHRASES).size * 2)
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
    expect(asked.every(t => t.startsWith(`${PHRASE_DIRECTION} `))).toBe(true)
    asked.length = 0
    await collect(synthesize, { ...voice, model: 'inworld-tts-1.5-mini' })
    expect(asked.some(t => t.startsWith('['))).toBe(false)
  })

  it('stop being made once voice has ended', async () => {
    let wanted = true
    const synthesize = vi.fn(async (text: string) => { wanted = false; return Buffer.from(text) })
    expect(await collect(synthesize, voice, () => wanted)).toEqual([])
    expect(synthesize).toHaveBeenCalledTimes(1)
  })
})
