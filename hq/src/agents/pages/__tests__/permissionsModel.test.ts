import { describe, it, expect } from 'vitest'
import { organisationDraft, narrowingDraft, permissionsModel as m } from '@agenthix/ui/agents'
import { here, organisation } from './permissionsFixtures'

describe('the organisation’s draft @SC-618', () => {
  it('saves every changeable tool and leaves the always-available ones out', () => {
    const save = m.toSave(organisationDraft(organisation()))
    expect(save.approval).toBe('deferred')
    expect(save.allowedTools?.map(t => t.name)).not.toContain('ping')
    expect(save.allowedTools).toContainEqual({ name: 'edit_file', state: 'ask' })
    expect(save.allowedBashPatterns).toEqual([{ pattern: 'npm test', state: 'always' }, { pattern: 'rm -rf', state: 'never' }])
  })

  it('applies a preset: a tool it names takes its state, a built-in it leaves out is withheld, a platform tool is asked about', () => {
    const preset = { id: 'x', label: 'X', description: '', dot: '', tools: [{ name: 'read_file', state: 'always' as const }], bashPatterns: [{ pattern: 'ls', state: 'always' as const }] }
    const d = m.applyPreset(organisationDraft(organisation()), preset)
    const state = (n: string) => d.tools.find(t => t.name === n)?.state
    expect([state('read_file'), state('edit_file'), state('list_tasks'), state('ping')]).toEqual(['always', 'never', 'ask', 'always'])
    expect(d.patterns.map(p => p.pattern)).toEqual(['ls'])
    expect(d.approval).toBe('deferred')
    expect(m.detectPreset(d)).toBe('custom')
  })

  it('adds a pattern that runs at Always, and removes one', () => {
    let d = m.addPattern(organisationDraft(organisation()), '  git status ')
    expect(d.patterns.at(-1)).toMatchObject({ pattern: 'git status', state: 'always' })
    expect(m.addPattern(d, 'git status').patterns).toHaveLength(3)
    d = m.removePattern(d, 'git status')
    expect(d.patterns.map(p => p.pattern)).toEqual(['npm test', 'rm -rf'])
  })
})

describe('a narrowing’s draft @SC-619', () => {
  it('never goes looser than the organisation', () => {
    const d = narrowingDraft(here())
    expect(m.setToolState(d, 'edit_file', 'always').tools.find(t => t.name === 'edit_file')?.state).toBe('ask')
    expect(m.setToolState(d, 'read_file', 'never').tools.find(t => t.name === 'read_file')?.state).toBe('never')
    expect(m.setGroupState(d, 'web', 'always').tools.filter(t => t.group === 'web').map(t => t.state)).toEqual(['ask', 'never'])
  })

  it('saves only what it makes stricter, and null for what it leaves to the organisation', () => {
    expect(m.toSave(narrowingDraft(here()))).toEqual({ approval: null, allowedTools: null, allowedBashPatterns: null })
    let d = narrowingDraft(here())
    d = m.setToolState(d, 'web_fetch', 'never')
    d = m.setPatternState(d, 'npm test', 'ask')
    d = m.setApproval(d, 'immediate')
    expect(m.toSave(d)).toEqual({
      approval: 'immediate',
      allowedTools: [{ name: 'web_fetch', state: 'never' }],
      allowedBashPatterns: [{ pattern: 'npm test', state: 'ask' }],
    })
    expect(m.narrowedCount(d)).toBe(3)
  })

  it('undoes every narrowing with the organisation’s preset', () => {
    let d = narrowingDraft(here())
    d = m.addPattern(m.setToolState(d, 'web_fetch', 'never'), 'curl')
    expect(m.detectPreset(d)).toBe('custom')
    d = m.organisationsPreset(d)
    expect(m.detectPreset(d)).toBe('organisation')
    expect(m.narrowedCount(d)).toBe(0)
  })

  it('counts nothing below approval while the run is bypassed', () => {
    const d = narrowingDraft(here({}, { organisationBypassed: true, approval: { organisation: 'bypassed', here: null, effective: 'bypassed', narrowed: false } }))
    expect(m.toolsShown(d)).toBe(false)
    expect(m.narrowedCount(m.setToolState(d, 'read_file', 'never'))).toBe(0)
  })

  it('blocks a new command here, limited by what the organisation allows the Bash tool', () => {
    const d = m.addPattern(narrowingDraft(here()), 'curl')
    expect(d.patterns.at(-1)).toMatchObject({ pattern: 'curl', state: 'never', limit: 'ask', added: true })
  })
})
