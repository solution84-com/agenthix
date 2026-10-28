import { describe, it, expect } from 'vitest'
import { skillGroups, slashQueryAt, type SkillRow } from '../slashQuery'

describe('where a / opens the skill picker', () => {
  it('opens for a / at the very start of the message, then no space up to the caret', () => {
    expect(slashQueryAt('/', 1)).toEqual({ start: 0, end: 1, fragment: '' })
    expect(slashQueryAt('/rev', 4)).toEqual({ start: 0, end: 4, fragment: 'rev' })
    expect(slashQueryAt('/rev more', 4)).toEqual({ start: 0, end: 4, fragment: 'rev' })
  })

  it('stays closed for a / anywhere else, past a space, or with no caret', () => {
    expect(slashQueryAt('see src/app', 11)).toBeNull()
    expect(slashQueryAt('and/or', 6)).toBeNull()
    expect(slashQueryAt(' /rev', 5)).toBeNull()
    expect(slashQueryAt('/rev more', 9)).toBeNull()
    expect(slashQueryAt('/rev', null)).toBeNull()
    expect(slashQueryAt(`/${'x'.repeat(65)}`, 66)).toBeNull()
  })
})

const row = (over: Partial<SkillRow>): SkillRow => ({
  name: 'org-x', title: 'X', description: '', source: 'every-agent', sourceName: 'Fernhill', detail: 'acme/x 1.0.0', ...over,
})
const rows = [
  row({ name: 'person-notes', title: 'My review notes', source: 'yours', sourceName: 'Yours', description: 'How I like review notes' }),
  row({ name: 'org-code-review', title: 'Code review', description: 'Review a change' }),
  row({ name: 'platform-git', title: 'Working with git', source: 'builtin', sourceName: 'Built in', description: 'Branch and commit' }),
  row({ name: 'shared-release', title: 'Review a release', source: 'place', sourceName: 'Website rebuild', description: '' , detail: '.agents/skills/release' }),
]

describe("the picker's groups", () => {
  it('groups by where each comes from, built in first and the person\'s own last', () => {
    expect(skillGroups(rows, '').map(g => g.heading)).toEqual(['Built in', 'Fernhill', 'Website rebuild', 'Yours'])
  })

  it('narrows on name and description, a name that starts with it first, and drops the groups left empty', () => {
    const groups = skillGroups(rows, 'rev')
    expect(groups.map(g => g.heading)).toEqual(['Fernhill', 'Website rebuild', 'Yours'])
    expect(skillGroups(rows, 'REVIEW NOTES').flatMap(g => g.items.map(i => i.reference))).toEqual(['person-notes'])
    expect(skillGroups(rows, 'branch').flatMap(g => g.items.map(i => i.reference))).toEqual(['platform-git'])
    expect(skillGroups(rows, 'zzz')).toEqual([])
  })

  it('gives each item the staged name as its reference, and the description, else the tag, as its detail', () => {
    const items = skillGroups(rows, '').flatMap(g => g.items)
    expect(items.find(i => i.reference === 'shared-release')).toMatchObject({ label: 'Review a release', detail: '.agents/skills/release' })
    expect(items.find(i => i.reference === 'org-code-review')).toMatchObject({ label: 'Code review', detail: 'Review a change' })
  })
})
