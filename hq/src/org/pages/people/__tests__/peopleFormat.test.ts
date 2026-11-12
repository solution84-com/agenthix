import { visitorNumber } from '../../../../demo/visitors'
import { describe, it, expect } from 'vitest'
import {
  orgRoleLabel, personMatches, expiryText, invitedProjectsText, removalDestinations, eraseConfirmationMatches, localTimeText, fleetAdminRole, shownHandle,
} from '../peopleFormat'

describe('Organisation › People wording and rules @SC-603', () => {
  it('shows the organisation roles as Admin and Member (adr-0102) @SC-627', () => {
    expect(orgRoleLabel('MEMBER')).toBe('Member')
    expect(orgRoleLabel('ADMIN')).toBe('Admin')
    expect(orgRoleLabel(null)).toBe('—')
  })

  it('searches by name or handle, with or without @', () => {
    const dana = { name: 'Dana Whitfield', handle: 'dana' }
    expect(personMatches(dana, 'whit')).toBe(true)
    expect(personMatches(dana, '@dan')).toBe(true)
    expect(personMatches(dana, 'avery')).toBe(false)
    expect(personMatches({ name: 'Former member', handle: null }, 'dana')).toBe(false)
    expect(personMatches(dana, '  ')).toBe(true)
  })

  it('says when an invitation expires', () => {
    const now = new Date('2026-10-08T10:00:00Z')
    expect(expiryText(new Date('2026-10-15T10:00:00Z'), now)).toBe('Expires in 7 days')
    expect(expiryText(new Date('2026-10-09T09:00:00Z'), now)).toBe('Expires in 1 day')
    expect(expiryText(new Date('2026-10-08T09:00:00Z'), now)).toBe('Expires today')
    expect(expiryText(null, now)).toBe('No expiry')
  })

  it('counts the projects an invitation names that the viewer cannot see', () => {
    expect(invitedProjectsText([{ name: 'Website' }], 2)).toBe('Website, 2 private projects')
    expect(invitedProjectsText([], 1)).toBe('1 private project')
    expect(invitedProjectsText([], 0)).toBeNull()
  })

  it('asks for a choice in every project with open tasks and assumes none', () => {
    const projects = [{ id: 'a', openTaskCount: 2 }, { id: 'b', openTaskCount: 0 }, { id: 'c', openTaskCount: 1 }]
    expect(removalDestinations(projects, { a: { kind: 'wait' } })).toBeNull()
    expect(removalDestinations(projects, { a: { kind: 'wait' }, c: { kind: 'person', userId: 'u' } })).toEqual([
      { projectId: 'a', destination: { kind: 'wait' } },
      { projectId: 'c', destination: { kind: 'person', userId: 'u' } },
    ])
    expect(removalDestinations([{ id: 'b', openTaskCount: 0 }], {})).toEqual([])
  })

  it('accepts the name or the handle to confirm an erase, ignoring case', () => {
    const p = { name: 'Dana Whitfield', handle: 'dana' }
    expect(eraseConfirmationMatches(p, 'dana whitfield')).toBe(true)
    expect(eraseConfirmationMatches(p, '@Dana')).toBe(true)
    expect(eraseConfirmationMatches(p, 'Dana W')).toBe(false)
    expect(eraseConfirmationMatches(p, '')).toBe(false)
  })

  it('tells their local time, or nothing when the zone is unknown', () => {
    const now = new Date('2026-10-08T12:00:00Z')
    expect(localTimeText('Asia/Phnom_Penh', now)).toBe('7:00 PM')
    expect(localTimeText('Not/AZone', now)).toBeNull()
    expect(localTimeText(null, now)).toBeNull()
  })
})

describe('the fleet admin role on a person\'s page (spec §7)', () => {
  it('says it is given in the Fleet Console, since when it is held', () => {
    expect(fleetAdminRole(true, new Date(2026, 9, 12))).toEqual({ state: 'Held', note: 'Given in the Fleet Console. Held since 12 Oct.' })
  })

  it('says what to do when it is not held, with no link to a page that may not open', () => {
    expect(fleetAdminRole(false, null)).toEqual({ state: 'Not held', note: 'Given in the Fleet Console. Ask a fleet admin to give it.' })
  })
})

describe('the handle a People row shows in the demo @SC-1973', () => {
  const visitor = { name: 'Visitor 4691', handle: 'visitor-7801991832c994461474e94a' }
  it('is @visitor-NNNN for a visitor, read from their username, whatever their name', () => {
    expect(shownHandle(visitor, true)).toBe(`@visitor-${visitorNumber(visitor.handle)}`)
    expect(shownHandle({ ...visitor, name: 'Renamed' }, true)).toBe(`@visitor-${visitorNumber(visitor.handle)}`)
  })
  it('is the handle as it is for everyone else in the demo', () => {
    expect(shownHandle({ name: 'Sam Okafor', handle: 'sam' }, true)).toBe('@sam')
  })
  it('is the handle as it is outside the demo, even for a name that looks like a visitor', () => {
    expect(shownHandle(visitor, false)).toBe('@visitor-7801991832c994461474e94a')
  })
  it('is nothing for an erased person', () => {
    expect(shownHandle({ name: 'Erased', handle: null }, true)).toBeNull()
  })
})
