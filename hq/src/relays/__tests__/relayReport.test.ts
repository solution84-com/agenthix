import { describe, it, expect } from 'vitest'
import { readRelayReport } from '../relayReport'

const good = { type: 'relay.report', version: '1.0', startedAt: '2026-10-26T10:00:00.000Z', sites: ['s1', 's2'], openStreams: 3, bytesCarried: 1024 }

describe('a relay report read off the wire @SC-1526', () => {
  it('keeps the report without its type and version', () => {
    expect(readRelayReport(JSON.stringify(good))).toEqual({ startedAt: good.startedAt, sites: ['s1', 's2'], openStreams: 3, bytesCarried: 1024 })
  })

  it.each([
    ['not JSON', '{'],
    ['not an object', '[1]'],
    ['another frame', JSON.stringify({ ...good, type: 'relay.welcome' })],
    ['a start that is not a time', JSON.stringify({ ...good, startedAt: 'yesterday' })],
    ['a site that is not an id', JSON.stringify({ ...good, sites: ['s1', 7] })],
    ['an over-long site id', JSON.stringify({ ...good, sites: ['x'.repeat(129)] })],
    ['a negative count', JSON.stringify({ ...good, openStreams: -1 })],
    ['a fractional count', JSON.stringify({ ...good, bytesCarried: 1.5 })],
    ['a count that is a string', JSON.stringify({ ...good, bytesCarried: '10' })],
  ])('drops %s', (_what, text) => {
    expect(readRelayReport(text)).toBeNull()
  })
})
