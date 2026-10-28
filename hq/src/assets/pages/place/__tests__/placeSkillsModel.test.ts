import { describe, expect, it } from 'vitest'
import { countsLine, groupSkills, isWaiting, looserThanOrganisation, pageCounts, rowActions, stateWords, waitingNote } from '../placeSkillsModel'
import { MAY_ALL, MAY_NONE, skill } from './fixtures'

describe('the words of a row', () => {
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

describe('who may do what', () => {
  it('viewers read and switch nothing', () => {
    const a = rowActions(skill({ status: 'unpublished', version: null, newestVersion: null }), MAY_NONE)
    expect(a).toMatchObject({ switch: false, publish: false, edit: false, remove: false, history: false, read: true })
  })
  it('administrators can publish a changed skill, put its version back and see what changed', () => {
    const a = rowActions(skill({ status: 'changed', version: null, newestVersion: 4 }), MAY_ALL)
    expect(a).toMatchObject({ publish: true, putBack: true, changes: true, history: true })
  })
})

describe('the page', () => {
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

describe('the default', () => {
  it('a place may be stricter than the organisation, never looser', () => {
    expect(looserThanOrganisation('ON', 'OFF')).toMatch(/stricter, never looser/)
    expect(looserThanOrganisation('NEVER', 'OFF')).toBeNull()
    expect(looserThanOrganisation('OFF', 'OFF')).toBeNull()
  })
})
