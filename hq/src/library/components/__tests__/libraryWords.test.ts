import { describe, it, expect } from 'vitest'
import { isLibraryTab, publisherText, sourceText, USE_LABEL } from '../libraryWords'

describe('where a library item came from @SC-678', () => {
  it('marks Built in, Made here and Marketplace with its version', () => {
    expect(sourceText({ source: 'BUILT_IN', version: '1' })).toBe('Built in')
    expect(sourceText({ source: 'MADE_HERE', version: '1' })).toBe('Made here')
    expect(sourceText({ source: 'MARKETPLACE', version: '2.1' })).toBe('Marketplace · v2.1')
  })

  it('names the publisher except for what ships with hq', () => {
    expect(publisherText({ source: 'MARKETPLACE', publisher: 'Northwind Labs' })).toBe('by Northwind Labs')
    expect(publisherText({ source: 'MADE_HERE', publisher: 'Acme Corp' })).toBe('by Acme Corp')
    expect(publisherText({ source: 'BUILT_IN', publisher: 'Agenthix' })).toBeNull()
    expect(publisherText({ source: 'MADE_HERE', publisher: null })).toBeNull()
  })

  it('knows its tabs, and that an agent is added to agents', () => {
    expect(['agents', 'boards', 'skills', 'teams', 'marketplace'].every(isLibraryTab)).toBe(true)
    expect(isLibraryTab('workforce')).toBe(false)
    expect(isLibraryTab(null)).toBe(false)
    expect(USE_LABEL.agents).toBe('Add to agents')
  })
})
