import { deriveSlug, deriveProjectKey } from './identifiers'

describe('deriveSlug @SC-017', () => {
  it('lowercases and replaces non-alphanumeric with hyphens', () => {
    expect(deriveSlug('Platform Program', [])).toBe('platform-program')
  })

  it('strips leading and trailing hyphens', () => {
    expect(deriveSlug('  --Hello--  ', [])).toBe('hello')
  })

  it('appends -2 on first collision', () => {
    expect(deriveSlug('platform', ['platform'])).toBe('platform-2')
  })

  it('increments suffix until unique', () => {
    expect(deriveSlug('platform', ['platform', 'platform-2', 'platform-3'])).toBe('platform-4')
  })

  it('handles names with only non-alpha chars', () => {
    expect(deriveSlug('!!!', [])).toBe('untitled')
  })
})

describe('deriveProjectKey', () => {
  describe('single-word names', () => {
    it('uses 3 chars as the default', () => {
      expect(deriveProjectKey('Dashboard', [])).toBe('DAS')
    })

    it('expands to 4 chars on collision', () => {
      expect(deriveProjectKey('Dashboard', ['DAS'])).toBe('DASH')
    })

    it('expands to 5 chars on continued collision', () => {
      expect(deriveProjectKey('Dashboard', ['DAS', 'DASH'])).toBe('DASHB')
    })

    it('expands to 6 chars on continued collision', () => {
      expect(deriveProjectKey('Dashboard', ['DAS', 'DASH', 'DASHB'])).toBe('DASHBO')
    })

    it('appends a letter when the 6-char form still collides', () => {
      expect(deriveProjectKey('Dashboard', ['DAS', 'DASH', 'DASHB', 'DASHBO'])).toBe('DASA')
    })

    it('moves to the next letter until unique', () => {
      expect(deriveProjectKey('Dashboard', ['DAS', 'DASH', 'DASHB', 'DASHBO', 'DASA'])).toBe('DASB')
    })

    it('pads short single-word names to 3 chars', () => {
      expect(deriveProjectKey('Go', [])).toBe('GOX')
    })

    it('falls back to a letter suffix when padded short name collides', () => {
      expect(deriveProjectKey('Go', ['GOX'])).toBe('GOXA')
    })
  })

  describe('multi-word names', () => {
    it('uses initials of each word', () => {
      expect(deriveProjectKey('New Project', [])).toBe('NP')
    })

    it('handles three or more words', () => {
      expect(deriveProjectKey('Customer Service Portal', [])).toBe('CSP')
    })

    it('treats hyphens and digits as word separators', () => {
      expect(deriveProjectKey('My-Project 2026', [])).toBe('MP')
    })

    it('caps initials at 6 chars', () => {
      expect(deriveProjectKey('A B C D E F G H', [])).toBe('ABCDEF')
    })

    it('appends a letter on collision', () => {
      expect(deriveProjectKey('New Project', ['NP'])).toBe('NPA')
    })

    it('keeps six letters at most when six initials clash', () => {
      expect(deriveProjectKey('A B C D E F', ['ABCDEF'])).toBe('ABCDEA')
    })
  })

  describe('edge cases', () => {
    it('returns PROJ for names with no alpha chars', () => {
      expect(deriveProjectKey('123', [])).toBe('PROJ')
    })

    it('returns PROJA when PROJ is taken', () => {
      expect(deriveProjectKey('123', ['PROJ'])).toBe('PROJA')
    })

    it('always yields two to six letters, however many clash', () => {
      const keys: string[] = []
      for (let i = 0; i < 800; i++) keys.push(deriveProjectKey('New Project', keys))
      expect(new Set(keys).size).toBe(800)
      for (const k of keys) expect(k).toMatch(/^[A-Z]{2,6}$/)
    })

    it('returns PROJ for blank names', () => {
      expect(deriveProjectKey('', [])).toBe('PROJ')
    })
  })
})
