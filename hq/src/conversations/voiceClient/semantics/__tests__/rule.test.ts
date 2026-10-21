import { describe, expect, it } from 'vitest'
import { VOICE_SETTINGS } from '../../settings'
import { answerAt } from '../rule'

const at = (mark: number, score: number) => answerAt(VOICE_SETTINGS.pause, mark, score)

describe('the decision rule @SC-995', () => {
  it('lets a clearly finished question go at 0.5 s, and otherwise waits', () => {
    expect(at(500, 0.95)).toBe('READY')
    // "The second one." scored 0.89 on the owner's recordings: a short finished answer goes at 0.5 s too.
    expect(at(500, 0.89)).toBe('READY')
    expect(at(500, 0.84)).toBe('UNCERTAIN')
    expect(at(500, 0.01)).toBe('UNCERTAIN')
  })
  it('gives the spec’s three examples at the 1 s checkpoint', () => {
    expect(at(1_000, 0.95)).toBe('READY')
    expect(at(1_000, 0.05)).toBe('KEEP_LISTENING')
    expect(at(1_000, 0.6)).toBe('UNCERTAIN')
  })
  it('needs less confidence the longer the silence: the same 0.6 is UNCERTAIN at 1 s and READY at 2 s', () => {
    expect(at(1_000, 0.6)).toBe('UNCERTAIN')
    expect(at(2_000, 0.6)).toBe('READY')
    expect(at(2_000, 0.2)).toBe('KEEP_LISTENING')
    expect(at(2_000, 0.3)).toBe('UNCERTAIN')
  })
})
