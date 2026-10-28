import { describe, it, expect } from 'vitest'
import { usedSkillsOf, USED_SKILLS_READ } from '../usedSkillRecord'
import { plainSkillName, usedSkillLabel } from '../usedSkillOrigin'

const FP = 'a'.repeat(64)
const use = (over: Record<string, unknown> = {}) => ({ name: 'org-review', source: 'org', fingerprint: FP, identity: 'fernhill/review', version: '1.3.0', ...over })

describe("a run's record of the skills it used, read as the site's word @SC-1658", () => {
  it('keeps each staged skill by its staged name', () => {
    const used = usedSkillsOf([use(), use({ name: 'boundary-release', source: 'boundary', identity: undefined, version: undefined, placeId: 'p1', path: '.agents/skills/release' })])
    expect([...used.keys()]).toEqual(['org-review', 'boundary-release'])
    expect(used.get('boundary-release')).toEqual({ name: 'boundary-release', source: 'boundary', fingerprint: FP, placeId: 'p1', path: '.agents/skills/release' })
  })

  it('never counts a refused skill as used, whatever its reason is', () => {
    expect(usedSkillsOf([use({ refused: 'it changed in files' })]).size).toBe(0)
    expect(usedSkillsOf([use({ refused: 42 })]).size).toBe(0)
    expect(usedSkillsOf([use({ refused: '' })]).size).toBe(0)
  })

  it.each([
    ['no name', { name: '' }],
    ['a name that is not a staged name', { name: '../org-review' }],
    ['a source that is not one', { source: 'anywhere' }],
    ['a fingerprint that is not one', { fingerprint: 'abc' }],
    ['a field of the wrong type', { personId: 7 }],
    ['a field too long', { identity: 'x'.repeat(513) }],
  ])('leaves out an entry with %s', (_what, change) => {
    expect(usedSkillsOf([use(change)]).size).toBe(0)
  })

  it('trusts neither entry of a name recorded twice', () => {
    expect(usedSkillsOf([use(), use({ fingerprint: 'b'.repeat(64) })]).size).toBe(0)
  })

  it('reads nothing from a record that is not a list, and no more than a run could stage', () => {
    expect(usedSkillsOf(null).size).toBe(0)
    expect(usedSkillsOf({ 'org-review': use() }).size).toBe(0)
    const many = Array.from({ length: USED_SKILLS_READ + 5 }, (_, i) => use({ name: `org-s${i}` }))
    expect(usedSkillsOf(many).size).toBe(USED_SKILLS_READ)
  })
})

describe("a used skill's step @SC-1658", () => {
  it('reads with its person-facing name, where it came from and its version', () => {
    expect(usedSkillLabel({ title: 'Review code', where: 'Fernhill', version: '1.3' })).toBe('Used the skill Review code · Fernhill · 1.3')
    expect(usedSkillLabel({ title: 'Review a release', where: 'Website rebuild', version: null })).toBe('Used the skill Review a release · Website rebuild')
  })

  it('falls back to the staged name without its source', () => {
    expect(plainSkillName('org-dev-code-review')).toBe('dev-code-review')
    expect(plainSkillName('workspace-2-release')).toBe('release')
    expect(plainSkillName('person-notes')).toBe('notes')
  })
})
