import { describe, expect, it } from 'vitest'
import type { VoiceBackchannelKindEvent } from '@agenthix/core'
import { ACCESS, scriptedModel, userText } from '../../playground/light/__tests__/fakes'
import type { VoiceBackchannelSoundEvent } from '@agenthix/core'
import { createHumService, soundRequestOf, type HumServiceDeps, type HumSound } from '../service'
import { HUM_HINT_LINE, HUM_INSTRUCTIONS, HUM_INSTRUCTIONS_VERSION, HUM_PAUSED_LINE, HUM_RECENT_LINE, lastWords } from '../instructions'

const session = { conversationId: 'c1', holderId: 'u1' }

const script = () => scriptedModel([
  [/ankle/, 'sympathy gentle'], [/slow/, { delayMs: 50, text: 'thoughtful thoughtful' }], [/broken/, new Error('down')],
  [/moved/, 'news curious | Oh, it moved?'], [/garbled/, 'it sounds like news'],
])

/** `made`: the words already made for the voice, as `words|tone`; the rest are made when spoken. */
function rig(over: Partial<HumServiceDeps> = {}, model = script(), made: string[] = []) {
  const sent: VoiceBackchannelKindEvent[] = []
  const sounds: VoiceBackchannelSoundEvent[] = []
  const spoken: HumSound[] = []
  const disk = new Set(made)
  let t = 1_000
  const service = createHumService({
    enabled: async () => true, access: async () => ACCESS, model, send: (_s, e) => sent.push(e),
    made: async (_s, sound) => disk.has(`${sound.words}|${sound.tone}`),
    speak: async (_s, sound) => {
      spoken.push(sound)
      const key = `${sound.words}|${sound.tone}`
      const was = disk.has(key)
      disk.add(key)
      return { audio: Buffer.from([1, 2]), made: was ? 'kept' : 'new' }
    },
    sendSound: (_s, e) => sounds.push(e),
    now: () => (t += 10), timeoutMs: 2_000, ...over,
  })
  return { service, sent, model, sounds, spoken, disk }
}

describe('the hum service in hq @SC-2228', () => {
  it('answers each question with the kind and tone, never words, by its seq, and how long the call took', async () => {
    const { service, sent, model } = rig()
    await service.ask(session, { seq: 3, text: 'and then my friend twisted her ankle' })
    expect(sent).toEqual([{ conversationId: 'c1', seq: 3, kind: 'sympathy', tone: 'gentle', ms: 10 }])
    // Only the words, with its short instruction: no conversation, no names.
    expect(model.requests).toHaveLength(1)
    expect(userText(model.requests[0]!)).toBe('and then my friend twisted her ankle')
    // Room for the line: two words were enough for v5, the spike's answers took up to about twenty tokens.
    expect(model.requests[0]!.maxOutputTokens).toBe(30)
    // Its instruction names every kind and tone, with when each fits.
    const system = model.requests[0]!.system.map(b => b.text).join('')
    for (const word of ['amusement', 'gentle', 'telling something bad, worrying or frustrating', 'none']) expect(system).toContain(word)
    expect(HUM_INSTRUCTIONS_VERSION).toBeGreaterThanOrEqual(1)
  })

  it('runs one call at a time for a voice session: a question while one is in flight gets no call and no answer', async () => {
    const { service, sent, model } = rig()
    const first = service.ask(session, { seq: 1, text: 'this is slow to think about' })
    await service.ask(session, { seq: 2, text: 'and the ankle' })
    await first
    expect(sent.map(e => [e.seq, e.kind])).toEqual([[1, 'thoughtful']])
    expect(model.requests).toHaveLength(1)
    await service.ask(session, { seq: 3, text: 'her ankle' })
    expect(sent.at(-1)).toMatchObject({ seq: 3, kind: 'sympathy' })
  })

  it('says why no kind came: off with no hum service here, the time limit, a failed call', async () => {
    const off = rig({ access: async () => null })
    await off.service.ask(session, { seq: 1, text: 'hello' })
    expect(off.sent).toEqual([{ conversationId: 'c1', seq: 1, kind: null, tone: null, ms: 0, failed: 'off' }])
    expect(off.model.requests).toHaveLength(0)

    const disabled = rig({ enabled: async () => false })
    await disabled.service.ask(session, { seq: 1, text: 'hello' })
    expect(disabled.sent[0]).toMatchObject({ kind: null, failed: 'off' })

    const slow = rig({ timeoutMs: 5 })
    await slow.service.ask(session, { seq: 1, text: 'this is slow' })
    expect(slow.sent[0]).toMatchObject({ seq: 1, kind: null, failed: 'timeout' })

    const broken = rig()
    await broken.service.ask(session, { seq: 1, text: 'broken' })
    expect(broken.sent[0]).toMatchObject({ seq: 1, kind: null, failed: 'failed' })
  })

  it('sends the model only the turn\'s last sixty words', async () => {
    const words = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ')
    expect(lastWords(words).split(' ')).toHaveLength(60)
    expect(lastWords(words).startsWith('w40 ')).toBe(true)
    expect(lastWords('  a   b ')).toBe('a b')
  })

  it('says so after the words on the call made as a pause begins, and only then', async () => {
    const { service, model } = rig()
    await service.ask(session, { seq: 1, text: 'we left really early, about 6 in the morning', atPause: true })
    await service.ask(session, { seq: 2, text: 'and then my friend twisted her ankle' })
    expect(userText(model.requests[0]!)).toBe(`we left really early, about 6 in the morning\n\n${HUM_PAUSED_LINE}`)
    expect(userText(model.requests[1]!)).toBe('and then my friend twisted her ankle')
    expect(HUM_PAUSED_LINE).toBe('They have just paused.')
  })
})

describe('the listening read\'s answers @SC-2228', () => {
  it('ignores the words a read adds; an unreadable answer is a failed call', async () => {
    const { service, sent } = rig()
    await service.ask(session, { seq: 1, text: 'they moved it' })
    await service.ask(session, { seq: 2, text: 'garbled' })
    expect(sent).toEqual([
      { conversationId: 'c1', seq: 1, kind: 'news', tone: 'curious', ms: 10 },
      { conversationId: 'c1', seq: 2, kind: null, tone: null, ms: 10, failed: 'failed' },
    ])
  })

  it('tells the read its last three sounds, after the pause line', async () => {
    const { service, model } = rig()
    await service.ask(session, { seq: 1, text: 'and her ankle', atPause: true, recent: ['Mm-hm.', 'Right.', 'Oh.', 'Okay.'] })
    expect(userText(model.requests[0]!)).toBe(`and her ankle\n\n${HUM_PAUSED_LINE}\n${HUM_RECENT_LINE} Right. Oh. Okay.`)
  })
})

describe('the hum library\'s sounds, made on demand @SC-2228', () => {
  it('sends each word of the kind made for the voice, with no speech call, and makes one more', async () => {
    const { service, sounds, spoken } = rig({}, script(), ['Oh no.|gentle', 'Aw.|gentle', 'Oh no.|warm'])
    await service.speak(session, { kind: 'sympathy', tone: 'gentle' })
    expect(sounds.map(e => [e.words, e.tone, e.made])).toEqual([['Oh no.', 'gentle', 'kept'], ['Aw.', 'gentle', 'kept'], ['Ouch.', 'gentle', 'new']])
    expect(spoken.map(x => x.words)).toEqual(['Oh no.', 'Aw.', 'Ouch.'])
    // Asked again (each read of that kind and tone): nothing sent twice, one more made, so the set fills.
    await service.speak(session, { kind: 'sympathy', tone: 'gentle' })
    expect(sounds.slice(3).map(e => [e.words, e.made])).toEqual([['Oh dear.', 'new']])
  })

  it('is made once per voice and word-and-tone: a later conversation is sent it as already made', async () => {
    const { service, sounds, disk } = rig()
    await service.speak(session, { kind: 'continuer', tone: 'calm' })
    const later = rig({}, script(), [...disk])
    await later.service.speak({ conversationId: 'c2', holderId: 'u1' }, { kind: 'continuer', tone: 'calm' })
    expect(sounds.map(e => [e.words, e.made])).toEqual([['Mm-hm.', 'new']])
    expect(later.sounds.map(e => [e.words, e.made])).toEqual([['Mm-hm.', 'kept'], ['Mhm.', 'new']])
  })

  it('warms every word of the kind in the tone at once', async () => {
    const { service, sounds } = rig()
    await service.speak(session, { kind: 'receipt', tone: 'calm', warm: true })
    expect(sounds).toHaveLength(10)
    expect(sounds.every(e => e.tone === 'calm' && e.kind === 'receipt' && e.made === 'new')).toBe(true)
  })

  it('makes a laugh once, and says once that it could not be made', async () => {
    const { service, spoken } = rig()
    await service.speak(session, { kind: 'amusement', tone: 'bright' })
    await service.speak(session, { kind: 'amusement', tone: 'bright' })
    expect(spoken).toEqual([{ kind: 'amusement', tone: 'bright', words: '(laughs)' }])
    const mute = rig({ speak: async () => null })
    await mute.service.speak(session, { kind: 'amusement', tone: 'bright' })
    await mute.service.speak(session, { kind: 'amusement', tone: 'bright' })
    expect(mute.sounds).toEqual([{ conversationId: 'c1', kind: 'amusement', tone: 'bright', words: '(laughs)', failed: true }])
  })

  it('makes and sends nothing where adaptive voice listening is off for the holder', async () => {
    const { service, sounds, spoken } = rig({ enabled: async () => false }, script(), ['Mm-hm.|calm'])
    await service.speak(session, { kind: 'continuer', tone: 'calm', warm: true })
    expect(sounds).toEqual([])
    expect(spoken).toEqual([])
  })

  it('takes only a kind of the library and a tone it takes', () => {
    expect(soundRequestOf('sympathy', 'gentle', undefined)).toEqual({ kind: 'sympathy', tone: 'gentle' })
    expect(soundRequestOf('continuer', 'calm', true)).toEqual({ kind: 'continuer', tone: 'calm', warm: true })
    expect(soundRequestOf('sympathy', 'bright', undefined)).toBeNull()
    expect(soundRequestOf('none', 'calm', undefined)).toBeNull()
    expect(soundRequestOf('Say anything', 'calm', undefined)).toBeNull()
  })
})

describe('the listening read\'s instructions, v8 @SC-2228', () => {
  it('answers kind and tone only, with each kind\'s tones, and may weigh its recent sounds', () => {
    expect(HUM_INSTRUCTIONS_VERSION).toBe(8)
    expect(HUM_INSTRUCTIONS).toMatch(/the kind, then the tone/)
    expect(HUM_INSTRUCTIONS).not.toMatch(/\|/)
    expect(HUM_INSTRUCTIONS).toContain('- sympathy (gentle, warm, calm):')
    expect(HUM_INSTRUCTIONS).toContain(`"${HUM_RECENT_LINE}"`)
  })

  it('reads a live transcript, keeps none for a cut-off ending or a question, and explains the pause line', () => {
    expect(HUM_INSTRUCTIONS).toMatch(/live speech-to-text transcript/)
    expect(HUM_INSTRUCTIONS).toMatch(/punctuation is unreliable/)
    expect(HUM_INSTRUCTIONS).toMatch(/none only when the ending is plainly cut off/)
    for (const word of ['"the"', '"a"', '"and"', '"but"', '"because"', '"to"', '"my"', '"then it got"']) expect(HUM_INSTRUCTIONS).toContain(word)
    expect(HUM_INSTRUCTIONS).toMatch(/just asked you a question/)
    expect(HUM_INSTRUCTIONS).toContain(`"${HUM_PAUSED_LINE}"`)
  })
})

describe('Tone in the listening read (spec §Tone)', () => {
  it('with Tone on, the voice hint goes with the question, after the pause line, in hq\'s words', async () => {
    const { service, model } = rig({ tone: () => ({ on: true, hint: 'sounds sad' }) })
    await service.ask(session, { seq: 1, text: 'and then my friend twisted her ankle', atPause: true })
    expect(userText(model.requests[0]!)).toBe(`and then my friend twisted her ankle\n\n${HUM_PAUSED_LINE}\n${HUM_HINT_LINE} sounds sad.`)
    expect(HUM_INSTRUCTIONS).toContain(`"${HUM_HINT_LINE} …"`)
  })

  it('with Tone off, no hint, and every read is calm', async () => {
    const { service, sent, model } = rig({ tone: () => ({ on: false, hint: 'sounds sad' }) })
    await service.ask(session, { seq: 1, text: 'and then my friend twisted her ankle' })
    expect(userText(model.requests[0]!)).toBe('and then my friend twisted her ankle')
    expect(sent[0]).toMatchObject({ kind: 'sympathy', tone: 'calm' })
  })
})
