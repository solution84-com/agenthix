import { describe, it, expect } from 'vitest'
import { deriveProjectKey } from '../identifiers.js'

const PROJECT_KEY = /^[A-Z]{2,6}$/

describe('deriveProjectKey on a clash', () => {
  it('gives a second project with the same initials a letters-only key', () => {
    const first = deriveProjectKey('Side Research', [])
    const second = deriveProjectKey('Side Research', [first])
    expect(second).not.toBe(first)
    expect(second).toMatch(PROJECT_KEY)
  })

  it('stays two to six letters through many clashes', () => {
    for (const name of ['Go', 'Dashboard', 'New Project', 'A B C D E F', '123']) {
      const keys: string[] = []
      for (let i = 0; i < 100; i++) keys.push(deriveProjectKey(name, keys))
      expect(new Set(keys).size).toBe(100)
      for (const k of keys) expect(k).toMatch(PROJECT_KEY)
    }
  })
})
