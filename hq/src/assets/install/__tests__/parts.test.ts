import { describe, it, expect } from 'vitest'
import { readParts } from '../parts'

const f = (path: string, text: string) => ({ path, content: Buffer.from(text) })
const SKILL = '---\nname: code-review\ndescription: Reviews code\n---\n\n# Code Review\n\nBody\n'
const manifest = (over: Record<string, unknown> = {}) => JSON.stringify({ format: 2, kind: 'skill', publisher: 'acme', name: 'code-review', version: '1.2.0', description: 'Reviews', ...over })

describe('what a package holds', () => {
  it('reads a format 2 manifest, keeping its publisher only as a claim', () => {
    const parts = readParts({ root: 'x', files: [f('SKILL.md', SKILL), f('package.json', manifest())] })
    expect(parts).toMatchObject({ kind: 'skill', name: 'code-review', version: '1.2.0', claim: 'acme', title: 'Code Review', description: 'Reviews code', plain: false })
  })

  it('reads a plain skill folder as unsigned-to-be, named by its folder', () => {
    expect(readParts({ root: 'my-skill', files: [f('SKILL.md', '---\ndescription: d\nmetadata:\n  version: "1.2"\n---\nb')] }))
      .toMatchObject({ name: 'my-skill', version: '1.2.0', claim: null, plain: true })
    expect(() => readParts({ root: 'My Skill', files: [f('SKILL.md', SKILL)] })).toThrow(/folder's name is the skill's name/)
    expect(() => readParts({ root: 'x', files: [f('README.md', 'x')] })).toThrow(/neither a package.json nor a SKILL.md/)
  })

  it('refuses a format 1 package and a manifest that fails core\'s checks', () => {
    expect(() => readParts({ root: 'x', files: [f('package.json', JSON.stringify({ format: 1, kind: 'skill' }))] })).toThrow(/older hq/)
    expect(() => readParts({ root: 'x', files: [f('package.json', manifest({ version: 'one' }))] })).toThrow(/SemVer/)
    expect(() => readParts({ root: 'x', files: [f('package.json', '{')] })).toThrow(/not valid JSON/)
  })

  it("reads a template's skills, each with its own claim when it has a manifest", () => {
    const parts = readParts({ root: 't', files: [
      f('package.json', manifest({ kind: 'team', name: 'delivery' })),
      f('skills/a/SKILL.md', SKILL),
      f('skills/b/SKILL.md', SKILL), f('skills/b/package.json', manifest({ publisher: 'agenthix', name: 'b', version: '9.0.0' })),
    ] })
    expect(parts.embedded.map(e => [e.name, e.claim, e.version])).toEqual([['a', 'acme', '1.2.0'], ['b', 'agenthix', '9.0.0']])
  })
})
