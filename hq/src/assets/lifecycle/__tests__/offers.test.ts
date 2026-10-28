import { describe, it, expect } from 'vitest'
import { offeredUpdate, pastMark } from '../offers'

const v = (version: string, withdrawn = false) => ({ version, withdrawn })

describe('what is offered after Skip this version and dismissed news (U5) @SC-1621', () => {
  it('offers the newest version newer than the one in use, never a withdrawn one', () => {
    expect(offeredUpdate([v('1.3.0'), v('1.4.0'), v('1.5.0', true)], '1.3.0', null)?.version).toBe('1.4.0')
    expect(offeredUpdate([v('1.3.0')], '1.3.0', null)).toBeNull()
  })

  it('hides a skipped version and every older one, until a later version is held', () => {
    expect(offeredUpdate([v('1.3.0'), v('1.4.0')], '1.3.0', '1.4.0')).toBeNull()
    expect(offeredUpdate([v('1.3.0'), v('1.4.0'), v('1.5.0')], '1.3.0', '1.4.0')?.version).toBe('1.5.0')
  })

  it('shows news past the version seen up to, and all of it when none was dismissed', () => {
    expect(pastMark('1.4.0', null)).toBe(true)
    expect(pastMark('1.4.0', '1.4.0')).toBe(false)
    expect(pastMark('1.5.0', '1.4.0')).toBe(true)
  })
})
