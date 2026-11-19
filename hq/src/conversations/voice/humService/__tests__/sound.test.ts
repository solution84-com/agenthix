import { describe, expect, it } from 'vitest'
import { soundSaid } from '../sound'

const directed = { model: 'inworld-tts-2' }
const plain = { model: 'inworld-tts-1' }

describe('a listening sound as speech @SC-2228 @SC-2237', () => {
  it('is the words with the tone\'s full steering, on a model that takes a direction', () => {
    expect(soundSaid({ kind: 'sympathy', tone: 'gentle', words: 'Oh no.' }, directed)).toBe('[soft, sympathetic] Oh no.')
    expect(soundSaid({ kind: 'thoughtful', tone: 'thoughtful', words: 'Hmm.' }, directed)).toBe('[low voice, thinking] Hmm.')
    expect(soundSaid({ kind: 'sympathy', tone: 'gentle', words: 'Oh no.' }, directed, { gentle: '[quiet, sad]' })).toBe('[quiet, sad] Oh no.')
  })

  it('is the words alone in calm: no direction at all, the baseline', () => {
    expect(soundSaid({ kind: 'continuer', tone: 'calm', words: 'Mm-hm.' }, directed)).toBe('Mm-hm.')
  })

  it('is the words alone on any other model, and a laugh only where a direction is taken', () => {
    expect(soundSaid({ kind: 'sympathy', tone: 'gentle', words: 'Oh no.' }, plain)).toBe('Oh no.')
    expect(soundSaid({ kind: 'amusement', tone: 'bright', words: '(laughs)' }, directed)).toBe('[laughing]')
    expect(soundSaid({ kind: 'amusement', tone: 'bright', words: '(laughs)' }, plain)).toBeNull()
  })
})
