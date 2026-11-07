import { describe, expect, it } from 'vitest'
import { countsLine, groupSkills, needsYou, looserThanOrganisation, pageCounts, primaryAction, removeNote, rowActions, stateLine } from '../placeSkillsModel'
import { MAY_ALL, MAY_NONE, skill } from './fixtures'

describe('the words of a row @SC-1642 @SC-1645 @SC-1646', () => {
  it('a published skill is its version and whether it is on', () => {
    expect(stateLine(skill())).toBe('Version 3 · on for every agent here')
    expect(stateLine(skill({ state: 'off', switch: 'OFF' }))).toBe('Version 3 · off')
  })
  it('a skill found in files and never published says what it waits for', () => {
    const s = skill({ status: 'unpublished', version: null, newestVersion: null, state: 'off', switch: null, switchHolds: false })
    expect(stateLine(s)).toBe("Found in this place's files · off until you publish it")
    expect(primaryAction(s, MAY_ALL)).toBe('publish')
  })
  it('a published skill changed in files says so, and its action is seeing the change', () => {
    const s = skill({ status: 'changed', version: null, newestVersion: 4, state: 'off', switchHolds: false })
    expect(stateLine(s)).toBe('Its files changed · off until you look at the change')
    expect(primaryAction(s, MAY_ALL)).toBe('seeChange')
  })
  it('a copy from the Library says so, with the newer version when there is one', () => {
    const copy = skill({ origin: { identity: 'a/b', version: '1.0.0' } })
    expect(stateLine(copy)).toBe('A copy of a/b 1.0.0 from the Library · on for every agent here · stays at this version')
    expect(primaryAction(copy, MAY_ALL)).toBeNull()
    const newer = { ...copy, libraryUpdate: '1.1.0' }
    expect(stateLine(newer)).toMatch(/1\.1\.0 available$/)
    expect(primaryAction(newer, MAY_ALL)).toBe('update')
  })
  it('a set-aside skill is set aside, with no switch', () => {
    const s = skill({ setAsideReason: 'Set aside: another skill has the same name here.', state: 'off' })
    expect(stateLine(s)).toBe('Set aside · not used here')
    expect(rowActions(s, MAY_ALL).switch).toBe(false)
  })
  it('a repository skill is read-only and only switches', () => {
    const s = skill({ group: 'WORKSPACE', workspaceId: 'w1', path: 'workspace/w1/.claude/skills/deploy-preview', status: 'unpublished', version: null, newestVersion: null })
    expect(stateLine(s)).toBe("Found in the repository's .claude/skills · read-only · on")
    const a = rowActions(s, MAY_ALL)
    expect(a).toMatchObject({ switch: true, publish: false, edit: false, remove: false, history: false })
  })
})

describe('who may do what @SC-1643', () => {
  it('viewers read and switch nothing', () => {
    const a = rowActions(skill({ status: 'unpublished', version: null, newestVersion: null }), MAY_NONE)
    expect(a).toMatchObject({ switch: false, publish: false, edit: false, remove: false, history: false, read: true })
  })
  it('administrators can publish a changed skill, put its version back and see what changed', () => {
    const a = rowActions(skill({ status: 'changed', version: null, newestVersion: 4 }), MAY_ALL)
    expect(a).toMatchObject({ publish: true, putBack: true, changes: true, history: true })
  })
})

describe('the page @SC-1642', () => {
  const list = [
    skill({ id: 'a', path: '.agents/skills/b-skill', name: 'b-skill' }),
    skill({ id: 'b', path: '.agents/skills/a-skill', name: 'a-skill', state: 'off', switch: null, switchHolds: false, status: 'unpublished', version: null }),
    skill({ id: 'c', path: '.agents/skills/c-skill', name: 'c-skill', state: 'off', setAsideReason: 'x' }),
    skill({ id: 'd', path: '.agents/agents/ada/skills/landing', name: 'landing', group: 'AGENT', agentId: 'ada' }),
    skill({ id: 'e', path: 'workspace/w1/.claude/skills/deploy', name: 'deploy', group: 'WORKSPACE', workspaceId: 'w1' }),
  ]
  it('groups the place first, then each agent, then each workspace, skills by name', () => {
    const groups = groupSkills(list)
    expect(groups.map((g) => g.key)).toEqual(['place', 'agent:ada', 'workspace:w1'])
    expect(groups[0]!.skills.map((s) => s.id)).toEqual(['b', 'a', 'c'])
  })
  it('counts what is on and what needs you, and a viewer is not counted as needed', () => {
    const c = pageCounts(list)
    expect(c).toEqual({ on: 3, needYou: 1, setAside: 1 })
    expect(countsLine(c)).toBe('3 on · 1 need you · 1 set aside')
    expect(needsYou(list[1]!)).toBe(true)
    expect(pageCounts(list, MAY_NONE).needYou).toBe(0)
    expect(pageCounts(list, MAY_ALL).needYou).toBe(1)
  })
  it('a switch left off on purpose, a set-aside skill and a gone one need nobody', () => {
    expect(needsYou(skill({ state: 'off', switch: 'OFF', switchHolds: true }))).toBe(false)
    expect(needsYou(skill({ state: 'off', switchHolds: false, setAsideReason: 'x' }))).toBe(false)
    expect(needsYou(skill({ state: 'off', switchHolds: false, gone: true }))).toBe(false)
  })
})

describe('the default @SC-1642', () => {
  it('a place may be stricter than the organisation, never looser', () => {
    expect(looserThanOrganisation('ON', 'OFF')).toMatch(/stricter, never looser/)
    expect(looserThanOrganisation('NEVER', 'OFF')).toBeNull()
    expect(looserThanOrganisation('OFF', 'OFF')).toBeNull()
  })
})

describe('what Remove says it loses @SC-1647', () => {
  it('a published skill can be put back from its history', () => {
    expect(removeNote(skill())).toMatch(/published versions stay in the history, so it can be put back/)
  })
  it('a skill never published cannot be put back, and says so', () => {
    const s = skill({ status: 'unpublished', version: null, newestVersion: null })
    expect(removeNote(s)).toMatch(/never published, so it can't be put back/)
    expect(removeNote(s)).not.toMatch(/can be put back/)
  })
  it('a changed skill loses its change and can be put back only as its newest version', () => {
    const s = skill({ status: 'changed', version: null, newestVersion: 4 })
    expect(removeNote(s)).toMatch(/change made since version 4 was never published and can't be put back/)
    expect(removeNote(s)).toMatch(/Version 4 stays in the history/)
  })
})
