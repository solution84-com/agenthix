import { describe, it, expect } from 'vitest'
import { adminPathFor, isAdminPath, teamsBase } from '../adminPaths'

describe('where a former /org address now lives @SC-1190', () => {
  it.each([
    ['/org/people', '/admin/people'],
    ['/org/people/u1', '/admin/people/u1'],
    ['/org/people/u1/remove', '/admin/people/u1/remove'],
    ['/org/agents', '/admin/agents'],
    ['/org/agents/kernel', '/admin/agents/kernel'],
    ['/org/settings', '/admin/settings'],
    ['/org/settings/runs', '/admin/settings/runs'],
    ['/org/settings/risk-rules', '/admin/settings/risk-rules'],
    ['/org/settings/github', '/admin/settings/github'],
    ['/org/settings/model-access', '/admin/settings/model-access'],
    ['/org/settings/sites', '/admin/sites-for-projects'],
    ['/org/settings/where-work-runs', '/admin/where-work-runs'],
    ['/org/settings/where-work-runs/s1', '/admin/where-work-runs/s1'],
    ['/org/infrastructure', '/admin/infrastructure'],
    ['/org/infrastructure/diagnostics/logs', '/admin/infrastructure/diagnostics/logs'],
    ['/org/dashboard', '/admin'],
    ['/org/people/', '/admin/people'],
  ])('%s -> %s', (from, to) => {
    expect(adminPathFor(from)).toBe(to)
  })

  it('leaves what did not move', () => {
    expect(adminPathFor('/org')).toBeNull()
    expect(adminPathFor('/org/teams')).toBeNull()
    expect(adminPathFor('/org/unknown')).toBeNull()
    expect(adminPathFor('/organisation/people')).toBeNull()
  })
})

describe('the admin area is every address under /admin @SC-1190', () => {
  it('knows its addresses', () => {
    expect(isAdminPath('/admin')).toBe(true)
    expect(isAdminPath('/admin/people/u1')).toBe(true)
    expect(isAdminPath('/administrators')).toBe(false)
    expect(isAdminPath('/org')).toBe(false)
  })

  it('draws Teams in the frame the person is in', () => {
    expect(teamsBase('/admin/teams/t1')).toBe('/admin/teams')
    expect(teamsBase('/org/teams')).toBe('/org/teams')
  })
})
