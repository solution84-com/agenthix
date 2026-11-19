import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentVoice } from '../../speech'
import { createSoundStore } from '../store'

const voice = (voiceId: string): AgentVoice => ({ apiKey: 'k', voiceId, model: 'inworld-tts-2', providerId: 'p' })

/** Loud enough audio that trimming the silence keeps it. */
const AUDIO = Buffer.alloc(4_800, 0x40)

describe('the hum library made on demand, kept per voice @SC-2228 @SC-2237', () => {
  let dir: string
  let said: string[]
  const synthesize = async function* (text: string) { said.push(text); yield AUDIO }

  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hums-')); said = [] })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('makes a word in a tone once for a voice, and keeps it on disk for every later conversation', async () => {
    const sound = { kind: 'sympathy' as const, tone: 'gentle' as const, words: 'Oh no.' }
    const store = createSoundStore(() => dir)
    expect(await store.made(voice('Ashley'), sound)).toBe(false)
    expect(await store.sound(voice('Ashley'), sound, synthesize)).toMatchObject({ made: 'new' })
    expect(await store.made(voice('Ashley'), sound)).toBe(true)
    // A later conversation, even after hq restarts: a new store on the same disk.
    const later = createSoundStore(() => dir)
    expect(await later.sound(voice('Ashley'), sound, synthesize)).toMatchObject({ made: 'kept' })
    expect(said).toEqual(['[soft, sympathetic] Oh no.'])
  })

  it('makes it again for another voice, another tone, or a changed steering', async () => {
    const store = createSoundStore(() => dir)
    const sound = { kind: 'continuer' as const, tone: 'calm' as const, words: 'Mm-hm.' }
    await store.sound(voice('Ashley'), sound, synthesize)
    await store.sound(voice('Dennis'), sound, synthesize)
    await store.sound(voice('Ashley'), { ...sound, tone: 'warm' }, synthesize)
    await store.sound(voice('Ashley'), { ...sound, tone: 'warm' }, synthesize, { warm: '[kind]' })
    // Calm is no direction at all.
    expect(said).toEqual(['Mm-hm.', 'Mm-hm.', '[warm, encouraging] Mm-hm.', '[kind] Mm-hm.'])
  })

  it('makes one sound asked for twice at once only once', async () => {
    const store = createSoundStore(() => dir)
    const sound = { kind: 'receipt' as const, tone: 'calm' as const, words: 'Okay.' }
    const [a, b] = await Promise.all([store.sound(voice('Ashley'), sound, synthesize), store.sound(voice('Ashley'), sound, synthesize)])
    expect(a?.made).toBe('new')
    expect(b?.made).toBe('new')
    expect(said).toHaveLength(1)
  })

  it('keeps nothing when the speech service fails or the voice cannot make it', async () => {
    const store = createSoundStore(() => dir)
    const sound = { kind: 'receipt' as const, tone: 'calm' as const, words: 'Okay.' }
    const failing = async function* (): AsyncIterable<Buffer> { throw new Error('down') }
    expect(await store.sound(voice('Ashley'), sound, failing)).toBeNull()
    expect(await store.made(voice('Ashley'), sound)).toBe(false)
    const laugh = { kind: 'amusement' as const, tone: 'bright' as const, words: '(laughs)' }
    expect(await store.sound({ ...voice('Ashley'), model: 'inworld-tts-1' }, laugh, synthesize)).toBeNull()
  })
})
