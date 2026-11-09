import { describe, expect, it } from 'vitest'
import { forSpeech } from '../pronunciation'

describe('how a word is said @SC-1841', () => {
  it('respells the product name wherever it falls in a sentence, whatever its case', () => {
    expect(forSpeech('Agenthix is a platform.')).toBe('Agent-hicks is a platform.')
    expect(forSpeech("Let's talk about Agenthix as a platform, and AGENTHIX again.")).toBe("Let's talk about Agent-hicks as a platform, and Agent-hicks again.")
  })

  it('leaves other words, and the name inside a longer word, alone', () => {
    expect(forSpeech('An agent thinks.')).toBe('An agent thinks.')
    expect(forSpeech('Agenthixes')).toBe('Agenthixes')
  })
})
