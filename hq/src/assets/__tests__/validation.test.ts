import { describe, it, expect } from 'vitest'
import { validateSkill } from '../validation'

const md = (text: string) => [{ path: 'SKILL.md', content: Buffer.from(text) }]

describe('validation against the Agent Skills rules (R8)', () => {
  it('passes a well-formed skill', () => {
    expect(validateSkill('code-review', md('---\nname: code-review\ndescription: Reviews code\n---\nBody'))).toEqual({ errors: [], warnings: [] })
  })

  it('refuses a bad name, a missing SKILL.md, missing or broken front matter, and a description out of bounds', () => {
    expect(validateSkill('Code Review', md('---\ndescription: d\n---\n')).errors[0]).toMatch(/lowercase/)
    expect(validateSkill('a--b', md('---\ndescription: d\n---\n')).errors).toHaveLength(1)
    expect(validateSkill('x'.repeat(65), md('---\ndescription: d\n---\n')).errors).toHaveLength(1)
    expect(validateSkill('x', []).errors).toEqual(['It has no SKILL.md.'])
    expect(validateSkill('x', md('Just a body')).errors[0]).toMatch(/needs front matter/)
    expect(validateSkill('x', md('---\ndescription: d\n')).errors[0]).toMatch(/never closed/)
    expect(validateSkill('x', md('---\ndescription: [unclosed\n---\n')).errors[0]).toMatch(/not valid YAML/)
    expect(validateSkill('x', md('---\nname: x\n---\n')).errors[0]).toMatch(/needs a description/)
    expect(validateSkill('x', md(`---\ndescription: ${'d'.repeat(1025)}\n---\n`)).errors[0]).toMatch(/at most 1024/)
  })

  it('refuses files a disk would store differently', () => {
    const files = [...md('---\ndescription: d\n---\n'), { path: 'a.md', content: Buffer.from('1') }, { path: 'A.md', content: Buffer.from('2') }]
    expect(validateSkill('x', files).errors[0]).toMatch(/can't be stored as listed/)
  })

  it('warns, never refuses, for a long body, a different name and keys a run ignores', () => {
    const v = validateSkill('x', md(`---\nname: Code Review\ndescription: d\nallowed-tools: Bash\nhooks: {}\n---\n${'line\n'.repeat(501)}`))
    expect(v.errors).toEqual([])
    expect(v.warnings).toEqual([
      'SKILL.md calls itself “Code Review”; it runs as x.',
      '“allowed-tools” in SKILL.md is ignored when run.',
      '“hooks” in SKILL.md is ignored when run.',
      expect.stringMatching(/is 50\d lines long/),
    ])
  })
})
