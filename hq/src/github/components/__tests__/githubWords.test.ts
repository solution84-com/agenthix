import { describe, it, expect } from 'vitest'
import { acceptance, agoWords, cannotCreateWords, permissionRows, ruleWords, type AccountRow } from '../githubWords'

const account = (over: Partial<AccountRow> = {}): AccountRow => ({
  id: 'a1', installationId: 1, login: 'acme', type: 'Organization', state: 'ALLOWED', projectRule: 'EVERY_PROJECT', projectIds: [], userIds: [],
  reach: { selection: 'all', canCreateRepository: true, words: '' }, ...over,
})

describe('permissions', () => {
  it('lists the App\'s permissions with what uses each, those with a use first @SC-1308', () => {
    const rows = permissionRows({ issues: 'write', contents: 'write', environments: 'write' })
    expect(rows.map((r) => r.label)).toEqual(['Code: write', 'Environments: write', 'Issues: write'])
    expect(rows[0].use).toBe('push, pull')
    expect(rows[1].use).toBe('set-github-secrets')
  })

  it('says which latest permissions an account has not accepted @SC-1309', () => {
    expect(acceptance({ contents: 'write', issues: 'write' }, { contents: 'write' })).toEqual({ current: false, unknown: false, missing: ['Issues: write'] })
    expect(acceptance({ contents: 'read' }, { contents: 'write' }).current).toBe(true)
    expect(acceptance(null, { contents: 'write' }).unknown).toBe(true)
  })
})

describe('reach and rule @SC-1309', () => {
  it('says why an account cannot create a repository', () => {
    expect(cannotCreateWords(account())).toBeNull()
    expect(cannotCreateWords(account({ reach: { selection: 'selected', canCreateRepository: false, words: '' } }))).toBe("Can't create new repositories")
    expect(cannotCreateWords(account({ type: 'User', reach: { selection: 'selected', canCreateRepository: false, words: '' } }))).toContain('personal account')
  })

  it('writes who can connect', () => {
    const projects = new Map([['p1', 'North website'], ['p2', 'North mobile app']])
    const people = new Map([['u1', 'Sam']])
    expect(ruleWords(account(), projects, people)).toBe('Every project')
    expect(ruleWords(account({ projectRule: 'CHOSEN_PROJECTS', projectIds: ['p1', 'p2'] }), projects, people)).toBe('Only: North website, North mobile app')
    expect(ruleWords(account({ projectRule: 'CHOSEN_PROJECTS', userIds: ['u1'] }), projects, people)).toBe("Only: Sam's own work")
    expect(ruleWords(account({ projectRule: 'CHOSEN_PROJECTS' }), projects, people)).toBe('No project yet')
  })

  it('writes an age', () => {
    const now = new Date('2026-10-24T12:00:00Z')
    expect(agoWords('2026-10-24T11:50:00Z', now)).toBe('10 minutes ago')
    expect(agoWords('2026-10-24T11:59:50Z', now)).toBe('just now')
    expect(agoWords('2026-10-21T12:00:00Z', now)).toBe('3 days ago')
  })
})
