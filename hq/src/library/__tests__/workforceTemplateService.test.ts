import { describe, it, expect } from 'vitest'
import { suggestHandle, buildInitialSelections } from '../workforceTemplateTypes'
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
    { name: 'Main', description: 'Main project', defaultAgentHandle: 'dev', boards: [{ name: 'Kanban', template: 'kanban' }] },
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
    expect(sels.projects[0].boards[0].include).toBe(true)
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
