import { describe, it, expect } from 'vitest'
import { higherRole, ownRoleOf, personRow } from '../teamRoles'

describe('higherRole @SC-672', () => {
  it('ranks Admin over Member over Viewer, whichever way round', () => {
    expect(higherRole('VIEWER', 'MEMBER')).toBe('MEMBER')
    expect(higherRole('ADMIN', 'MEMBER')).toBe('ADMIN')
    expect(higherRole('MEMBER', 'ADMIN')).toBe('ADMIN')
    expect(higherRole('VIEWER', 'VIEWER')).toBe('VIEWER')
  })
})

describe('personRow (adr-0103) @SC-672', () => {
  it('is no member at all with neither their own membership nor a team', () => {
    expect(personRow(null, [])).toBeNull()
  })

  it('is their own role alone, with nothing kept apart, when no team brings them', () => {
    expect(personRow('MEMBER', [])).toEqual({ role: 'MEMBER', direct: true, ownRole: null })
  })

  it('is the team role for someone here only through a team', () => {
    expect(personRow(null, ['VIEWER'])).toEqual({ role: 'VIEWER', direct: false, ownRole: null })
  })

  it('applies the higher of their own role and every team role, and keeps their own apart', () => {
    expect(personRow('MEMBER', ['ADMIN'])).toEqual({ role: 'ADMIN', direct: true, ownRole: 'MEMBER' })
    expect(personRow('ADMIN', ['VIEWER'])).toEqual({ role: 'ADMIN', direct: true, ownRole: 'ADMIN' })
    expect(personRow(null, ['VIEWER', 'MEMBER'])).toEqual({ role: 'MEMBER', direct: false, ownRole: null })
  })
})

describe('ownRoleOf @SC-672', () => {
  it('reads their own role from the row: kept apart while a team raises it, else the role itself', () => {
    expect(ownRoleOf({ role: 'ADMIN', direct: true, ownRole: 'MEMBER' })).toBe('MEMBER')
    expect(ownRoleOf({ role: 'MEMBER', direct: true, ownRole: null })).toBe('MEMBER')
  })

  it('is none for someone here only through teams, or not here', () => {
    expect(ownRoleOf({ role: 'ADMIN', direct: false, ownRole: null })).toBeNull()
    expect(ownRoleOf(null)).toBeNull()
  })

  it('round-trips: taking every team away gives back exactly their own role', () => {
    const raised = personRow('VIEWER', ['ADMIN'])!
    expect(personRow(ownRoleOf(raised), [])).toEqual({ role: 'VIEWER', direct: true, ownRole: null })
  })
})
