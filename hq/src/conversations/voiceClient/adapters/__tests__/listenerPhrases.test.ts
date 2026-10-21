import { describe, expect, it } from 'vitest'
import type { Playback } from '../../playback'
import { VOICE_SETTINGS } from '../../settings'
import { createListenerPhrases } from '../listenerPhrases'

const L = VOICE_SETTINGS.activeListening

function setup(random: () => number) {
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
  for (const text of ['Mm-hm.', 'Yeah.']) phrases.add({ text, audio, use: 'active-listening' })
  for (const text of ['Yes?', 'Go on.']) phrases.add({ text, audio, use: 'encouragement' })
  const heard: string[] = []
  const play = (kind: 'active-listening' | 'encouragement') => {
    phrases.play(kind, VOICE_SETTINGS)
    const h = phrases.tick()
    if (h) heard.push(h.text)
    played.at(-1)?.end()
    phrases.tick()
  }
  return { phrases, enqueued, heard, play }
}

describe('the phrases said while the person holds the floor', () => {
  it('play an active listening phrase quieter than the reply, and an encouragement phrase as it is', () => {
    const s = setup(() => 0.9)
    s.play('active-listening')
    s.play('encouragement')
    expect(s.heard).toEqual(['Yeah.', 'Go on.'])
    expect(s.enqueued[0]![0]).toBe(Math.round(1000 * 10 ** (L.gainDb / 20)))
    expect(s.enqueued[1]![0]).toBe(1000)
  })

  it('sometimes leave an active listening phrase out, never an encouragement phrase', () => {
    const s = setup(() => 0)
    s.play('active-listening')
    s.play('encouragement')
    expect(s.heard).toEqual(['Yes?'])
  })

  it('never say the same twice in a row', () => {
    const s = setup(() => 0.5)
    for (let i = 0; i < 4; i++) s.play('encouragement')
    expect(s.heard).toEqual(['Go on.', 'Yes?', 'Go on.', 'Yes?'])
  })

  it('stop at once when cancelled, and play one at a time', () => {
    const s = setup(() => 0.9)
    s.phrases.play('encouragement', VOICE_SETTINGS)
    expect(s.phrases.busy()).toBe(true)
    s.phrases.play('encouragement', VOICE_SETTINGS)
    expect(s.enqueued).toHaveLength(1)
    expect(s.phrases.cancel()).toBe('Go on.')
    expect(s.phrases.busy()).toBe(false)
  })
})
