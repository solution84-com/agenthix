import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))

import { ruleIncludesPlace, type InstallationForRule } from '../connectRule'

const rule = (over: Partial<InstallationForRule> = {}): InstallationForRule =>
  ({ state: 'ALLOWED', projectRule: 'CHOSEN_PROJECTS', projectIds: [], userIds: [], ...over })
const project = { type: 'project' as const, id: 'p1' }
const own = { type: 'user' as const, id: 'u1' }

describe('which places may connect to a GitHub account @A15 @A17 @SC-1310', () => {
  it('only an allowed installation', () => {
    for (const state of ['WANTS_TO_CONNECT', 'IGNORED'] as const) {
      expect(ruleIncludesPlace(rule({ state, projectRule: 'EVERY_PROJECT', projectIds: ['p1'], userIds: ['u1'] }), project, null)).toBe(false)
    }
  })

  it('every project, or the chosen ones', () => {
    expect(ruleIncludesPlace(rule({ projectRule: 'EVERY_PROJECT' }), project, null)).toBe(true)
    expect(ruleIncludesPlace(rule(), project, null)).toBe(false)
    expect(ruleIncludesPlace(rule({ projectIds: ['p1'] }), project, null)).toBe(true)
  })

  it('never a person\'s own storage or personal project as part of every project', () => {
    expect(ruleIncludesPlace(rule({ projectRule: 'EVERY_PROJECT' }), own, null)).toBe(false)
    expect(ruleIncludesPlace(rule({ projectRule: 'EVERY_PROJECT' }), project, { ownerId: 'u1' })).toBe(false)
  })

  it('a chosen person\'s own storage and personal projects, and no one else\'s', () => {
    expect(ruleIncludesPlace(rule({ userIds: ['u1'] }), own, null)).toBe(true)
    expect(ruleIncludesPlace(rule({ userIds: ['u1'] }), project, { ownerId: 'u1' })).toBe(true)
    expect(ruleIncludesPlace(rule({ userIds: ['u2'] }), project, { ownerId: 'u1' })).toBe(false)
    expect(ruleIncludesPlace(rule({ projectIds: ['p1'] }), project, { ownerId: 'u1' })).toBe(false)
    expect(ruleIncludesPlace(rule({ userIds: ['u1'] }), project, { ownerId: null })).toBe(false)
  })
})
