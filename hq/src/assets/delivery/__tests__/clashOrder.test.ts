import { describe, it, expect } from 'vitest'
import { settleClashes, skillKey, type SkillCandidate, type SkillLevel } from '../clashOrder'

const at = (level: SkillLevel, key: string, item = `${level}:${key}`): SkillCandidate<string> => ({ level, key, label: key, item })

describe('the order when the same skill comes from two places @SC-1652', () => {
  it.each([
    ['installed', 'project'],
    ['installed', 'person'],
    ['project', 'person'],
  ] as const)('%s wins over %s, whichever comes first', (higher, lower) => {
    for (const list of [[at(higher, 'x'), at(lower, 'x')], [at(lower, 'x'), at(higher, 'x')]]) {
      const { kept, setAside } = settleClashes(list)
      expect(kept.map(c => c.item)).toEqual([`${higher}:x`])
      expect(setAside).toHaveLength(1)
      expect(setAside[0]).toMatchObject({ item: `${lower}:x`, level: lower, by: higher })
      expect(setAside[0].reason).toMatch(/is used instead/)
    }
  })

  it('sets aside both lower levels when all three have it', () => {
    const { kept, setAside } = settleClashes([at('person', 'x'), at('project', 'x'), at('installed', 'x')])
    expect(kept.map(c => c.item)).toEqual(['installed:x'])
    expect(setAside.map(s => [s.level, s.by])).toEqual([['person', 'installed'], ['project', 'installed']])
  })

  it('keeps different skills, all of them', () => {
    const { kept, setAside } = settleClashes([at('installed', 'acme/x'), at('project', 'x'), at('person', 'y')])
    expect(kept).toHaveLength(3)
    expect(setAside).toEqual([])
  })

  it('keeps two of one level with the same identity: staging names them apart', () => {
    const { kept } = settleClashes([at('project', 'x', 'a'), at('project', 'x', 'b')])
    expect(kept.map(c => c.item)).toEqual(['a', 'b'])
  })

  it('says which level won and why', () => {
    expect(settleClashes([at('person', 'x'), at('project', 'x')]).setAside[0].reason)
      .toBe("Set aside: this project's own x is used instead (the project's skill comes before a person's).")
    expect(settleClashes([at('project', 'acme/x'), at('installed', 'acme/x')]).setAside[0].reason)
      .toBe("Set aside: the organisation's installed acme/x is used instead (an installed skill comes first).")
  })
})

describe('what a skill is the same skill as @SC-1652', () => {
  it('is its identity when it names a valid one', () => {
    expect(skillKey({ identity: 'acme/code-review', name: 'review', path: '.agents/skills/r' })).toBe('acme/code-review')
  })

  it('is its name otherwise, so renaming makes it a different skill', () => {
    expect(skillKey({ identity: 'not an identity', name: 'Release-Notes', path: '.agents/skills/r' })).toBe('release-notes')
    expect(skillKey({ name: 'review', path: '.agents/skills/r' })).not.toBe(skillKey({ name: 'review-2', path: '.agents/skills/r' }))
  })

  it('is its folder when it has neither', () => {
    expect(skillKey({ name: '  ', path: 'workspace/w1/.claude/skills/deploy' })).toBe('deploy')
  })

  it('never takes an installed identity from a bare name', () => {
    expect(skillKey({ name: 'code-review', path: 'x/code-review' })).not.toBe('acme/code-review')
  })
})
