import { describe, expect, it } from 'vitest'
import { CONSOLE_LINK_METHODS, parseFleetActivityPage, parseFleetNotices, parseHqAccount } from '../index.js'

const at = '2026-10-15T13:02:00.000Z'

describe('the record of what fleet admins did, as hq answers it', () => {
  const entry = { id: 'a1', at, by: { id: 'u-sam', name: 'Sam Rivera' }, action: 'site.added', subject: 'office on office-server' }

  it('takes each entry field by field, with the page that follows', () => {
    expect(parseFleetActivityPage({ entries: [entry, { ...entry, id: 'a2', by: null }], next: 'a2' })).toEqual({
      entries: [entry, { ...entry, id: 'a2', by: null }], next: 'a2',
    })
    expect(parseFleetActivityPage({ entries: [], next: null })).toEqual({ entries: [], next: null })
  })

  it('drops an entry not in its shape, and keeps the others', () => {
    const page = parseFleetActivityPage({
      entries: [
        entry,
        { ...entry, id: 'bad id!' },
        { ...entry, at: 'yesterday' },
        { ...entry, by: { id: 'u-x' } },
        { ...entry, action: '' },
        { ...entry, subject: 'x'.repeat(501) },
        'nothing',
      ],
      next: null,
    })
    expect(page?.entries).toEqual([entry])
  })

  it('takes out control characters from what a person reads', () => {
    const page = parseFleetActivityPage({ entries: [{ ...entry, subject: 'office\u0000 on\n office-server', by: { id: 'u', name: 'Sam\u001b Rivera' } }], next: null })
    expect(page?.entries[0]).toMatchObject({ subject: 'office on office-server', by: { name: 'Sam Rivera' } })
  })

  it('reads a next page that is not an id as the last page', () => {
    expect(parseFleetActivityPage({ entries: [], next: '../x' })?.next).toBeNull()
  })

  it('is null when the answer carries no list', () => {
    for (const v of [null, undefined, {}, { entries: 'x' }, []]) expect(parseFleetActivityPage(v)).toBeNull()
  })
})

describe('the notices hq keeps for a fleet admin', () => {
  const notice = { id: 'n1', kind: 'machineNotHeardFrom', title: 'Not heard from office-server since 09:14', body: 'It may be switched off.', at, dismissible: false, hostId: 'h1' }

  it('takes each notice field by field', () => {
    expect(parseFleetNotices({ notices: [notice] })).toEqual([notice])
    const activity = { ...notice, id: 'n2', kind: 'activity', dismissible: true, hostId: null }
    expect(parseFleetNotices({ notices: [activity] })).toEqual([activity])
  })

  it('drops a notice of a kind it does not know, or not in its shape', () => {
    const list = parseFleetNotices({
      notices: [
        notice,
        { ...notice, kind: 'somethingNew' },
        { ...notice, title: '' },
        { ...notice, dismissible: 'yes' },
        { ...notice, hostId: '<script>' },
        { ...notice, at: 3 },
      ],
    })
    expect(list).toEqual([notice])
  })

  it('is null when the answer carries no list', () => {
    for (const v of [null, {}, { notices: {} }]) expect(parseFleetNotices(v)).toBeNull()
  })
})

describe('an HQ account found by its username', () => {
  const account = { id: 'u-jordan', name: 'Jordan Lee', username: 'jordan', organisationAdmin: true, fleetAdmin: false }

  it('takes the account field by field', () => {
    expect(parseHqAccount({ account })).toEqual(account)
  })

  it('is null for no account, or one not in its shape', () => {
    expect(parseHqAccount({ account: null })).toBeNull()
    expect(parseHqAccount({ account: { ...account, id: '' } })).toBeNull()
    expect(parseHqAccount({ account: { ...account, fleetAdmin: 'no' } })).toBeNull()
    expect(parseHqAccount(null)).toBeNull()
  })
})

it('names the new methods in the closed set', () => {
  for (const m of ['activity.list', 'notices.list', 'notices.dismiss', 'account.find']) expect(CONSOLE_LINK_METHODS).toContain(m)
})
