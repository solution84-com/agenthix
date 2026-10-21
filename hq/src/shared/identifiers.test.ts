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

    it('appends digit suffix when 6-char form still collides', () => {
      expect(deriveProjectKey('Dashboard', ['DAS', 'DASH', 'DASHB', 'DASHBO'])).toBe('DAS2')
    })

    it('increments digit suffix until unique', () => {
      expect(deriveProjectKey('Dashboard', ['DAS', 'DASH', 'DASHB', 'DASHBO', 'DAS2'])).toBe('DAS3')
    })

    it('pads short single-word names to 3 chars', () => {
      expect(deriveProjectKey('Go', [])).toBe('GOX')
    })

    it('falls back to digit suffix when padded short name collides', () => {
      expect(deriveProjectKey('Go', ['GOX'])).toBe('GOX2')
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

    it('appends digit suffix on collision', () => {
      expect(deriveProjectKey('New Project', ['NP'])).toBe('NP2')
    })
  })

  describe('edge cases', () => {
    it('returns PROJ for names with no alpha chars', () => {
      expect(deriveProjectKey('123', [])).toBe('PROJ')
    })

    it('returns PROJ2 when PROJ is taken', () => {
      expect(deriveProjectKey('123', ['PROJ'])).toBe('PROJ2')
    })

    it('returns PROJ for blank names', () => {
      expect(deriveProjectKey('', [])).toBe('PROJ')
    })
  })
})
