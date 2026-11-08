import { describe, it, expect } from 'vitest'
import { suggestHandle, buildInitialSelections, handleProblems, isApplicationSelections } from '../workforceTemplateTypes'
import type { WorkforceTemplateContent } from '../workforceTemplateTypes'

const TEMPLATE: WorkforceTemplateContent = {
  teams: [
    {
      name: 'Engineering',
      purpose: 'Build stuff',
      agents: [
        { handle: 'dev', name: 'Developer', role: 'Dev', responsibilities: 'Code', skills: [] },
        { handle: 'qa',  name: 'QA',        role: 'QA',  responsibilities: 'Test', skills: [] },
      ],
    },
  ],
  projects: [
    { name: 'Main', description: 'Main project', defaultAgentHandle: 'dev', types: [{ name: 'Bug', icon: 'bug' }], fields: [{ name: 'Severity' }] },
  ],
}

describe('suggestHandle @SC-066', () => {
  it('returns original handle when no collision', () => {
    expect(suggestHandle('dev', new Set())).toBe('dev')
  })

  it('returns handle-1 when original collides', () => {
    expect(suggestHandle('dev', new Set(['dev']))).toBe('dev-1')
  })

  it('increments suffix past existing suffixed handles', () => {
    expect(suggestHandle('dev', new Set(['dev', 'dev-1', 'dev-2']))).toBe('dev-3')
  })
})

describe('buildInitialSelections @SC-066', () => {
  it('marks all items included by default', () => {
    const sels = buildInitialSelections(TEMPLATE, new Set())
    expect(sels.teams[0].include).toBe(true)
    expect(sels.teams[0].agents[0].include).toBe(true)
    expect(sels.teams[0].agents[0].resolvedHandle).toBe('dev')
    expect(sels.projects[0].include).toBe(true)
    expect(sels.projects[0]).toEqual({ name: 'Main', include: true, defaultAgentHandle: 'dev' })
  })

  it('resolves colliding handles with a suffix', () => {
    const sels = buildInitialSelections(TEMPLATE, new Set(['dev']))
    expect(sels.teams[0].agents[0].resolvedHandle).toBe('dev-1')
    expect(sels.teams[0].agents[1].resolvedHandle).toBe('qa') // no collision
  })

  it('updates defaultAgentHandle in project when handle was resolved', () => {
    const sels = buildInitialSelections(TEMPLATE, new Set(['dev']))
    expect(sels.projects[0].defaultAgentHandle).toBe('dev-1')
  })
})

describe('handleProblems', () => {
  it('finds none when every included handle is free, valid and used once', () => {
    expect(handleProblems(buildInitialSelections(TEMPLATE, new Set(['other'])), new Set(['other']))).toEqual({})
  })

  it('names a typed handle that is taken, invalid or used twice, and skips agents left out', () => {
    const sels = buildInitialSelections(TEMPLATE, new Set())
    sels.teams[0].agents[0].resolvedHandle = 'taken'
    sels.teams[0].agents[1].resolvedHandle = 'Bad Handle'
    expect(handleProblems(sels, new Set(['taken']))).toEqual({ 'Engineering/dev': { handle: 'taken', why: 'already taken' }, 'Engineering/qa': { handle: 'Bad Handle', why: 'not a valid handle' } })
    sels.teams[0].agents[0].resolvedHandle = 'same'
    sels.teams[0].agents[1].resolvedHandle = 'same'
    expect(handleProblems(sels, new Set())).toEqual({ 'Engineering/dev': { handle: 'same', why: 'used twice here' }, 'Engineering/qa': { handle: 'same', why: 'used twice here' } })
    sels.teams[0].agents[1].include = false
    expect(handleProblems(sels, new Set())).toEqual({})
  })
})

describe('isApplicationSelections', () => {
  it('accepts the selections the review page builds', () => {
    expect(isApplicationSelections(buildInitialSelections(TEMPLATE, new Set()))).toBe(true)
    expect(isApplicationSelections({ teams: [], projects: [] })).toBe(true)
  })

  it('refuses anything else, so a draft the page would fail to read is never stored', () => {
    for (const bad of [null, 'x', [], {}, { teams: 'a', projects: [] }, { teams: [null], projects: [] },
      { teams: [{ name: 'T', include: true, agents: [{ handle: 'a', resolvedHandle: 1, include: true, skills: [] }] }], projects: [] },
      { teams: [], projects: [{ name: 'P', include: 'yes' }] }, { teams: [], projects: [{ name: 'P', include: true, defaultAgentHandle: 3 }] }]) {
      expect(isApplicationSelections(bad)).toBe(false)
    }
  })
})
