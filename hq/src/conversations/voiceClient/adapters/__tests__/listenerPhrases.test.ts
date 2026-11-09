import { describe, expect, it } from 'vitest'
import type { ListeningTier } from '../../orchestration/listeningTiers'
import type { Playback } from '../../playback'
import { VOICE_SETTINGS } from '../../settings'
import { createListenerPhrases } from '../listenerPhrases'

const L = VOICE_SETTINGS.listening

function setup(random: () => number, clips: Array<[string, ListeningTier]>) {
  const enqueued: Int16Array[] = []
  const played: Array<{ end: () => void }> = []
  const createPlayback = (): Playback => {
    let done = false
    const p = {
      enqueue: (_i: number, audio: ArrayBuffer) => { enqueued.push(new Int16Array(audio)) },
      finish: () => {}, stop: () => -1, close: () => {},
      position: () => ({ index: 0, elapsed: 0, ended: false }),
      idle: () => done, heardAudio: () => new Int16Array(0),
    }
    played.push({ end: () => { done = true } })
    return p
  }
  const phrases = createListenerPhrases({ createPlayback, random })
  const audio = new Int16Array([1000, -1000]).buffer
  for (const [text, tier] of clips) phrases.add({ text, audio, tier })
  const heard: string[] = []
  const play = (tiers: ListeningTier[], settings = L) => {
    phrases.play(tiers, settings)
    const h = phrases.tick()
    if (h) heard.push(h.text)
    played.at(-1)?.end()
    phrases.tick()
  }
  return { phrases, enqueued, heard, play }
}

const HUMS: Array<[string, ListeningTier]> = ['Mm-hm.', 'Mm.', 'Uh-huh.', 'Hm.'].map(t => [t, 'hum'])
const WORDS: Array<[string, ListeningTier]> = ['I see.', 'Right.', 'Got it.', 'Okay.'].map(t => [t, 'acknowledge'])
const INVITATIONS: Array<[string, ListeningTier]> = ['Go on.', 'Yes?'].map(t => [t, 'invitation'])

describe('the listening family\'s player', () => {
  it('plays a clip of the tiers asked for, every tier under the reply\'s level', () => {
    const s = setup(() => 0, [...HUMS, ...WORDS, ...INVITATIONS])
    s.play(['acknowledge'])
    s.play(['invitation'])
    expect(s.heard).toEqual(['I see.', 'Go on.'])
    const quieter = Math.round(1000 * 10 ** (L.gainDb / 20))
    expect(s.enqueued.map(a => a[0])).toEqual([quieter, quieter])
  })

  it('repeats none of the last six played, across all tiers', () => {
    const s = setup(Math.random, [...HUMS, ...WORDS, ...INVITATIONS])
    const asks: ListeningTier[][] = [['hum', 'acknowledge'], ['hum'], ['invitation'], ['hum', 'acknowledge'], ['acknowledge']]
    for (let i = 0; i < 200; i++) s.play(asks[i % asks.length]!)
    expect(s.heard.length).toBeGreaterThan(100)
    s.heard.forEach((text, i) => expect(s.heard.slice(Math.max(0, i - L.recent), i)).not.toContain(text))
  })

  it('plays nothing when every clip that fits was played that recently, or the tier has none yet', () => {
    const s = setup(() => 0, [...HUMS.slice(0, 2), ...WORDS])
    s.play(['hum'])
    s.play(['hum'])
    s.play(['hum'])
    expect(s.heard).toEqual(['Mm-hm.', 'Mm.'])
    s.play(['invitation'])
    expect(s.heard).toEqual(['Mm-hm.', 'Mm.'])
    expect(s.enqueued).toHaveLength(2)
  })

  it('does not play the same words again among the last few, even in another tone', () => {
    const s = setup(() => 0, [['Mm-hm.', 'hum'], ['Mm-hm.', 'hum'], ['Mm.', 'hum']])
    s.play(['hum'])
    s.play(['hum'])
    expect(s.heard).toEqual(['Mm-hm.', 'Mm.'])
  })

  it('stops at once when cancelled, and plays one at a time', () => {
    const s = setup(() => 0, INVITATIONS)
    expect(s.phrases.play(['invitation'], L)).toBe('Go on.')
    expect(s.phrases.busy()).toBe(true)
    expect(s.phrases.play(['invitation'], L)).toBeNull()
    expect(s.enqueued).toHaveLength(1)
    expect(s.phrases.cancel()).toBe('Go on.')
    expect(s.phrases.busy()).toBe(false)
  })

  it('lets a hum or a word finish when the person speaks, and stops an invitation', () => {
    const hum = setup(() => 0, [['Mm-hm.', 'hum']])
    hum.phrases.play(['hum'], L)
    expect(hum.phrases.cancel(true)).toBeNull()
    expect(hum.phrases.busy()).toBe(true)
    expect(hum.phrases.cancel()).toBe('Mm-hm.')
    const invitation = setup(() => 0, INVITATIONS)
    invitation.phrases.play(['invitation'], L)
    expect(invitation.phrases.cancel(true)).toBe('Go on.')
    expect(invitation.phrases.busy()).toBe(false)
  })
})
