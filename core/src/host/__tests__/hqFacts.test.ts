import { describe, expect, it } from 'vitest'
import { CONSOLE_LINK_METHODS, parseFleetAdminAccounts, parseHqAbout, parseSiteLoads } from '../index.js'

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
