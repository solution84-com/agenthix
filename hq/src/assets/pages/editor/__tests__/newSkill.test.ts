import { describe, it, expect } from 'vitest'
import { newSkillProblems, newSkillRequest } from '../newSkill'
import { reachWords } from '../PublishDialog'
import type { EditorView } from '../editorTypes'

describe('newSkillProblems @SC-1624', () => {
  it('says nothing before anything is typed, and names the rule when the name is wrong', () => {
    expect(newSkillProblems('', '')).toEqual({ name: null, description: null })
    expect(newSkillProblems('Release Notes', '').name).toMatch(/lowercase letters, digits and single hyphens/)
    expect(newSkillProblems('release-notes', 'x'.repeat(1025)).description).toMatch(/1025 characters/)
  })
  it('asks the agent to propose it, not write files', () => {
    const text = newSkillRequest('release-notes', 'Writes notes')
    expect(text).toContain('release-notes')
    expect(text).toContain('propose_skill')
  })
})

const view = (agentsWith: EditorView['agentsWith'], kind: 'library' | 'place' = 'library') =>
  ({ target: kind === 'library' ? { kind, assetId: 'a' } : { kind, placeSkillId: 'p' }, agentsWith }) as EditorView

describe('reachWords @SC-1624', () => {
  it('names who a publish reaches', () => {
    expect(reachWords(view({ everyAgent: true, names: [] }))).toBe('Every agent uses it from its next turn.')
    expect(reachWords(view({ everyAgent: false, names: ['Ada', 'Priya'] }))).toBe('Ada and Priya use it from their next turn.')
    expect(reachWords(view({ everyAgent: false, names: [] }))).toMatch(/No agent has it yet/)
  })
})
