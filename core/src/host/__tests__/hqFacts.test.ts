import { describe, expect, it } from 'vitest'
import { CONSOLE_LINK_METHODS, parseFleetAdminAccounts, parseHqAbout, parseHqRelay, parseSiteLoads } from '../index.js'

describe('what hq says of itself over the console link', () => {
  it('takes the organisation’s name and the address people open HQ at', () => {
    expect(parseHqAbout({ organisationName: '  Acme Robotics ', address: 'https://hq.acme.example/' }))
      .toEqual({ organisationName: 'Acme Robotics', address: 'https://hq.acme.example' })
    expect(parseHqAbout({ organisationName: 'Acme', address: 'http://192.168.1.20:4100' }))
      .toEqual({ organisationName: 'Acme', address: 'http://192.168.1.20:4100' })
  })

  it('drops a field that is not its shape, and keeps the other', () => {
    expect(parseHqAbout({ organisationName: 'Acme', address: 'javascript:alert(1)' })).toEqual({ organisationName: 'Acme', address: null })
    expect(parseHqAbout({ organisationName: 'Acme', address: 'https://sam:pw@hq.acme.example' })).toEqual({ organisationName: 'Acme', address: null })
    expect(parseHqAbout({ organisationName: 'Acme', address: 'https://hq.acme.example/?next=evil' })).toEqual({ organisationName: 'Acme', address: null })
    expect(parseHqAbout({ organisationName: 'x'.repeat(201), address: 'https://hq.acme.example' })).toEqual({ organisationName: null, address: 'https://hq.acme.example' })
    expect(parseHqAbout({ organisationName: 'Acme\u0000\nRobotics', address: 7 })).toEqual({ organisationName: 'AcmeRobotics', address: null })
    expect(parseHqAbout({ organisationName: '   ', address: 'https://hq.acme.example' })).toEqual({ organisationName: null, address: 'https://hq.acme.example' })
  })

  it('is null when the answer is not an object', () => {
    for (const v of [null, undefined, 'Acme', [], 3]) expect(parseHqAbout(v)).toBeNull()
  })

  it('names the new methods in the closed set', () => {
    expect(CONSOLE_LINK_METHODS).toContain('hq.about')
    expect(CONSOLE_LINK_METHODS).toContain('site.loads')
  })
})

describe('each site’s runs, as hq last heard them', () => {
  const site = { executionSiteId: 'site-1', isDefault: true, running: 2, maxAtOnce: 4, reportedAt: '2026-10-15T08:00:00.000Z' }

  it('takes each site field by field, and nothing else', () => {
    expect(parseSiteLoads({ sites: [{ ...site, projects: ['secret'] }] })).toEqual([site])
  })

  it('drops an entry that is not its shape, and keeps the others', () => {
    const bad = [
      { ...site, executionSiteId: '../x' },
      { ...site, running: -1 },
      { ...site, running: 1.5 },
      { ...site, maxAtOnce: '4' },
      { ...site, isDefault: 'yes' },
      { ...site, reportedAt: 'soon' },
      null,
    ]
    expect(parseSiteLoads({ sites: [...bad, { ...site, executionSiteId: 'site-2', isDefault: false }] }))
      .toEqual([{ ...site, executionSiteId: 'site-2', isDefault: false }])
  })

  it('is null when the answer has no list', () => {
    expect(parseSiteLoads({})).toBeNull()
    expect(parseSiteLoads(null)).toBeNull()
  })
})

describe('the fleet admins, as hq lists them', () => {
  const sam = { id: 'u-sam', name: 'Sam Rivera', username: 'sam', organisationAdmin: true, since: '2026-10-12T09:00:00.000Z' }

  it('takes each account field by field, with when it was given the role', () => {
    expect(parseFleetAdminAccounts([{ ...sam, password: 'x' }])).toEqual([sam])
  })

  it('reads an older hq, which does not say since when, as not known', () => {
    const { since: _since, ...old } = sam
    expect(parseFleetAdminAccounts([old])).toEqual([{ ...sam, since: null }])
    expect(parseFleetAdminAccounts([{ ...sam, since: 'last week' }])).toEqual([{ ...sam, since: null }])
  })

  it('drops an account without an id or a name', () => {
    expect(parseFleetAdminAccounts([{ ...sam, id: 7 }, { ...sam, name: null }, 'u-sam'])).toEqual([])
    expect(parseFleetAdminAccounts('not a list')).toEqual([])
  })
})

describe('hq’s own relay over the console link @SC-1467', () => {
  const relay = {
    name: 'hq-box', filesAddress: 'https://files.acme.example/', answering: true, lastSeenAt: '2026-10-26T08:00:00Z',
    sites: 2, openStreams: 3, bytesCarried: 38_000_000,
  }

  it('takes the relay in its shape', () => {
    expect(parseHqRelay({ relay })).toEqual({ ...relay, filesAddress: 'https://files.acme.example', lastSeenAt: '2026-10-26T08:00:00.000Z' })
    expect(CONSOLE_LINK_METHODS).toContain('relay.facts')
  })

  it('keeps a relay with no files address and no report yet, with each missing figure null', () => {
    expect(parseHqRelay({ relay: { name: 'hq-box', filesAddress: null, answering: false, lastSeenAt: null } }))
      .toEqual({ name: 'hq-box', filesAddress: null, answering: false, lastSeenAt: null, sites: null, openStreams: null, bytesCarried: null })
  })

  it('drops an address or a figure that is not its shape, and keeps the rest', () => {
    expect(parseHqRelay({ relay: { ...relay, filesAddress: 'javascript:alert(1)', sites: -1, openStreams: 1.5, bytesCarried: '9' } }))
      .toMatchObject({ filesAddress: null, sites: null, openStreams: null, bytesCarried: null, answering: true })
  })

  it('is null for no relay, a nameless one, or one that does not say whether it answers', () => {
    for (const v of [null, {}, { relay: null }, { relay: { ...relay, name: ' ' } }, { relay: { ...relay, answering: 'yes' } }, { relay: [] }]) {
      expect(parseHqRelay(v)).toBeNull()
    }
  })
})
