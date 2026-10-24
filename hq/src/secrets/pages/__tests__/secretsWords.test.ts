import { describe, it, expect } from 'vitest'
import { bytesToBase64, fileProblem, nameProblem, rotationWords, usedByWords } from '../secretsWords'

describe('secretsWords', () => {
  it('says what is wrong with a name before sending it', () => {
    expect(nameProblem('STAGING_KEY')).toBeNull()
    expect(nameProblem('')).toMatch(/name/)
    expect(nameProblem('staging')).toMatch(/Capitals/)
  })

  it('shows Rotate by in the week before the date and Overdue after it', () => {
    const rotateBy = new Date('2026-11-01T00:00:00Z')
    expect(rotationWords({ rotation: 'due_soon', rotateBy })).toEqual({ words: 'Rotate by 1 Nov', tone: 'warning' })
    expect(rotationWords({ rotation: 'overdue', rotateBy })).toEqual({ words: 'Overdue', tone: 'danger' })
    expect(rotationWords({ rotation: 'none', rotateBy: null })).toBeNull()
  })

  it('names what uses a value, or says it is not used', () => {
    expect(usedByWords(['a', 'b'])).toBe('a, b')
    expect(usedByWords([])).toBe('Not used')
  })

  it('refuses a file over 48 KB or empty', () => {
    expect(fileProblem(48 * 1024)).toBeNull()
    expect(fileProblem(48 * 1024 + 1)).toMatch(/at most 48 KB/)
    expect(fileProblem(0)).toMatch(/empty/)
  })

  it('encodes bytes in base64, large input included', () => {
    expect(bytesToBase64(new TextEncoder().encode('hi'))).toBe('aGk=')
    expect(bytesToBase64(new Uint8Array(48 * 1024)).length).toBe(Math.ceil((48 * 1024) / 3) * 4)
  })
})
