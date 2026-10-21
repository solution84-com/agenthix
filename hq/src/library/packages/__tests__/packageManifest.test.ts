import { describe, it, expect } from 'vitest'
import { effectiveSource, importedSource, parseManifest, publisherOf } from '../packageManifest'

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

describe('where an item came from @SC-679', () => {
  it('reads anything shipped with hq as Built in, whatever its column says', () => {
    expect(effectiveSource({ source: 'MADE_HERE', isSystem: true })).toBe('BUILT_IN')
    expect(effectiveSource({ source: 'MADE_HERE', scope: 'PLATFORM' })).toBe('BUILT_IN')
    expect(effectiveSource({ source: 'MARKETPLACE', scope: 'ORG' })).toBe('MARKETPLACE')
  })

  it('never imports an item as Built in: one from another hq arrives as made by its publisher', () => {
    expect(importedSource('built_in')).toBe('MADE_HERE')
    expect(importedSource('made_here')).toBe('MADE_HERE')
    expect(importedSource('marketplace')).toBe('MARKETPLACE')
  })

  it('names Agenthix as the publisher of a built-in item that names none', () => {
    expect(publisherOf({ source: 'BUILT_IN', publisher: null, isSystem: true })).toBe('Agenthix')
    expect(publisherOf({ source: 'MADE_HERE', publisher: null })).toBeNull()
    expect(publisherOf({ source: 'MARKETPLACE', publisher: 'Northwind Labs' })).toBe('Northwind Labs')
  })
})
