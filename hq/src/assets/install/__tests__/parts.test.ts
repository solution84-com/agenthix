import { describe, it, expect } from 'vitest'
import { readParts } from '../parts'

const f = (path: string, text: string) => ({ path, content: Buffer.from(text) })
const SKILL = '---\nname: code-review\ndescription: Reviews code\n---\n\n# Code Review\n\nBody\n'
const manifest = (over: Record<string, unknown> = {}) => JSON.stringify({ format: 2, kind: 'skill', publisher: 'acme', name: 'code-review', version: '1.2.0', description: 'Reviews', ...over })

describe('what a package holds @SC-1610', () => {
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

  it("reads a template's role skills under its name, and a shared skill under its own, without its manifest", () => {
    const parts = readParts({ root: 't', files: [
      f('package.json', manifest({ kind: 'team', name: 'delivery' })),
      f('skills/a/SKILL.md', SKILL),
      f('skills/b/SKILL.md', SKILL), f('skills/b/package.json', manifest({ publisher: 'agenthix', name: 'b', version: '9.0.0' })),
    ] })
    expect(parts.embedded.map(e => [e.name, e.claim, e.version, e.role])).toEqual([['b', 'agenthix', '9.0.0', false], ['delivery/a', 'acme', '1.2.0', true]])
    expect(parts.embedded.map(e => e.files.map(x => x.path))).toEqual([['SKILL.md'], ['SKILL.md']])
  })

  it("refuses a shared skill whose folder isn't its name, and a role skill folder that isn't a name", () => {
    expect(() => readParts({ root: 't', files: [
      f('package.json', manifest({ kind: 'agent', name: 'pm' })),
      f('skills/x/SKILL.md', SKILL), f('skills/x/package.json', manifest({ name: 'y' })),
    ] })).toThrow(/skills\/x\/ holds the skill y/)
    expect(() => readParts({ root: 't', files: [f('package.json', manifest({ kind: 'agent', name: 'pm' })), f('skills/Bad_Name/SKILL.md', SKILL)] }))
      .toThrow(/lowercase letters/)
  })
})

describe("a plain skill folder's suited-to hint @SC-1609", () => {
  const plain = (front: string) => readParts({ root: 'review', files: [f('SKILL.md', `---\ndescription: d\n${front}---\nb`)] })

  it('is read from suitedTo in its front matter', () => {
    expect(plain('suitedTo: [developer, reviewer]\n').suitedTo).toEqual(['developer', 'reviewer'])
  })

  it('is dropped, never refused, when it is not a list of at most 10 different lowercase words', () => {
    expect(plain('').suitedTo).toEqual([])
    expect(plain('suitedTo: developer\n').suitedTo).toEqual([])
    expect(plain('suitedTo: [Developer]\n').suitedTo).toEqual([])
    expect(plain('suitedTo: [a, a]\n').suitedTo).toEqual([])
    expect(plain(`suitedTo: [${Array.from({ length: 11 }, (_, i) => `w${i}`).join(', ')}]\n`).suitedTo).toEqual([])
  })
})
