import { describe, expect, it } from 'vitest'
import { countsLine, groupSkills, isWaiting, looserThanOrganisation, pageCounts, removeNote, rowActions, stateWords, waitingNote } from '../placeSkillsModel'
import { MAY_ALL, MAY_NONE, skill } from './fixtures'

describe('the words of a row @SC-1642 @SC-1645 @SC-1646', () => {
  it('a published skill is its version', () => {
    expect(stateWords(skill())).toEqual(['version 3'])
  })
  it('a skill found in files and never published says so and is off', () => {
    const s = skill({ status: 'unpublished', version: null, newestVersion: null, state: 'off', switch: null, switchHolds: false })
    expect(stateWords(s)).toEqual(['in files, not published', 'off'])
    expect(waitingNote(s)).toMatch(/Not run until published and switched on/)
  })
  it('a published skill changed in files keeps its version and says what changed in files', () => {
    const s = skill({ status: 'changed', version: null, newestVersion: 4, state: 'off', switchHolds: false })
    expect(stateWords(s)).toEqual(['changed in files, not published', 'off'])
  })
  it('a set-aside skill gives the reason and no switch', () => {
    const s = skill({ setAsideReason: 'Set aside: another skill has the same name here.', state: 'off' })
    expect(stateWords(s)).toContain('set aside')
    expect(waitingNote(s)).toBe('Set aside: another skill has the same name here.')
    expect(rowActions(s, MAY_ALL).switch).toBe(false)
  })
  it('a repository skill is read-only and only switches', () => {
    const s = skill({ group: 'WORKSPACE', workspaceId: 'w1', path: 'workspace/w1/.claude/skills/deploy-preview', status: 'unpublished', version: null, newestVersion: null })
    expect(stateWords(s)).toEqual(['repository · read-only'])
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
  it('counts what is on, waiting and set aside', () => {
    const c = pageCounts(list)
    expect(c).toEqual({ on: 3, waiting: 1, setAside: 1 })
    expect(countsLine(c)).toBe('3 on · 1 waiting · 1 set aside')
    expect(isWaiting(list[1]!)).toBe(true)
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
