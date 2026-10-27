import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))

import { hqRelayLine, hqRelayLineOverride, BAD_RELAY_LINE_URL_MESSAGE } from '../hqRelayLine'
import { lineUrlFor } from '../placement'

describe("hq's relay line override @SC-1525", () => {
  it('is unchanged when unset or blank', () => {
    expect(hqRelayLine({})).toBe('/relay-line')
    expect(hqRelayLine({ HQ_RELAY_LINE_URL: '  ' })).toBe('/relay-line')
    expect(hqRelayLineOverride({}).invalid).toBe(false)
  })

  it.each(['ws://localhost:4401/relay-line', 'wss://r.example.com/relay-line', 'http://localhost:4401/relay-line', 'https://r.example.com/relay-line'])(
    'takes %s',
    (url) => {
      expect(hqRelayLine({ HQ_RELAY_LINE_URL: ` ${url} ` })).toBe(url)
    },
  )

  it.each(['/relay-line', 'localhost:4401', 'ftp://localhost/relay-line', 'not a url', 'javascript:alert(1)'])(
    'ignores %s and flags it',
    (value) => {
      expect(hqRelayLine({ HQ_RELAY_LINE_URL: value })).toBe('/relay-line')
      expect(hqRelayLineOverride({ HQ_RELAY_LINE_URL: value }).invalid).toBe(true)
    },
  )

  it('has a warning that says what is wrong and what to do', () => {
    expect(BAD_RELAY_LINE_URL_MESSAGE).toMatch(/HQ_RELAY_LINE_URL is ignored/)
    expect(BAD_RELAY_LINE_URL_MESSAGE).toMatch(/Fix or remove/)
  })
})

describe('placement uses the override for hq\'s relay only @SC-1525', () => {
  const env = process.env
  it('overrides for hq\'s relay, not for another relay', () => {
    process.env = { ...env, HQ_RELAY_LINE_URL: 'ws://localhost:4401/relay-line' }
    try {
      expect(lineUrlFor({ isHq: true, address: 'https://files.x' })).toBe('ws://localhost:4401/relay-line')
      expect(lineUrlFor({ isHq: false, address: 'https://r.example.com' })).toBe('https://r.example.com/relay-line')
    } finally {
      process.env = env
    }
  })

  it('keeps the path when unset', () => {
    const { HQ_RELAY_LINE_URL: _unused, ...rest } = env
    process.env = rest
    try {
      expect(lineUrlFor({ isHq: true, address: null })).toBe('/relay-line')
    } finally {
      process.env = env
    }
  })
})
