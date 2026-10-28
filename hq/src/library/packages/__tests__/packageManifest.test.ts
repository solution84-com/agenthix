import { describe, it, expect } from 'vitest'
import { parseManifest } from '../packageManifest'

const valid = { format: 1, kind: 'skill', name: 'SEO audit', source: 'marketplace', version: '1.4', publisher: 'Agenthix' }

describe('parseManifest @SC-679', () => {
  it('reads a manifest, trimming its text and defaulting what is optional', () => {
    expect(parseManifest({ ...valid, name: ' SEO audit ' })).toEqual({ ...valid, description: '' })
    expect(parseManifest({ ...valid, publisher: '' }).publisher).toBeNull()
  })

  it.each([
    ['not an object', []],
    ['another format', { ...valid, format: 2 }],
    ['an unknown kind', { ...valid, kind: 'person' }],
    ['an unknown source', { ...valid, source: 'somewhere' }],
    ['no name', { ...valid, name: '  ' }],
    ['a version with spaces', { ...valid, version: '1 0' }],
    ['a name that is not text', { ...valid, name: 3 }],
  ])('refuses %s', (_what, raw) => {
    expect(() => parseManifest(raw)).toThrow()
  })
})
