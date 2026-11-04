import { describe, it, expect } from 'vitest'
import { SKILL_TREE_MAX_DEPTH, SKILL_TREE_MAX_ENTRIES } from '@agenthix/core'
import { placeTreeProblem } from '../treeBounds'
import { checkedPlaceSkill } from '../placeDrafts'

const md = { path: 'SKILL.md', content: Buffer.from('---\nname: s\ndescription: d\n---\nDo it.') }

describe("a draft held to the bounds a place's site holds a folder to", () => {
  it('counts the skill folder, the folders between and the files, as the site does', () => {
    const inFolder = (n: number) => Array.from({ length: n }, (_, i) => `a/f${i}.md`)
    expect(placeTreeProblem(['SKILL.md', ...inFolder(SKILL_TREE_MAX_ENTRIES - 3)])).toBeNull()
    expect(placeTreeProblem(['SKILL.md', ...inFolder(SKILL_TREE_MAX_ENTRIES - 2)])).toMatch(/at most 1000 files and folders/)
  })

  it('allows the depth the site allows and refuses one more', () => {
    const at = (levels: number) => `${Array.from({ length: levels }, (_, i) => `d${i}`).join('/')}/x.md`
    expect(placeTreeProblem(['SKILL.md', at(SKILL_TREE_MAX_DEPTH)])).toBeNull()
    expect(placeTreeProblem(['SKILL.md', at(SKILL_TREE_MAX_DEPTH + 1)])).toMatch(/nest folders at most 8 deep/)
  })

  it('refuses a place draft over the bounds at save, and says nothing was changed', () => {
    const many = Array.from({ length: SKILL_TREE_MAX_ENTRIES }, (_, i) => ({ path: `f${i}.md`, content: Buffer.from('x') }))
    expect(() => checkedPlaceSkill('s', [md, ...many])).toThrow(/at most 1000.*Nothing was changed\./)
    expect(() => checkedPlaceSkill('s', [md])).not.toThrow()
  })
})
