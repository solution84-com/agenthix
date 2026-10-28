import { describe, it, expect } from 'vitest'
import { parse } from 'yaml'
import { withSkillMetadata } from '../metadata'

const file = (text: string) => [{ path: 'SKILL.md', content: Buffer.from(text, 'utf-8') }, { path: 'scripts/run.sh', content: Buffer.from('echo hi') }]
const header = (files: { path: string; content: Buffer }[]) => {
  const text = files[0].content.toString('utf-8')
  const [, yaml] = text.split('---\n')
  return { meta: parse(yaml), body: text.split('\n---\n')[1] }
}

describe("writing hq's metadata into a skill's SKILL.md @SC-1644", () => {
  it('writes the version into metadata, keeping every other key, the body and the other files', () => {
    const out = withSkillMetadata(file('---\nname: review\ndescription: Reviews\nmetadata:\n  owner: ada\n---\n\n# Review\nDo it.\n'), { version: '4' })
    expect(header(out).meta).toEqual({ name: 'review', description: 'Reviews', metadata: { owner: 'ada', version: '4' } })
    expect(header(out).body).toBe('\n# Review\nDo it.\n')
    expect(out[1].content.toString()).toBe('echo hi')
  })

  it('replaces a version already there, and writes the identity of a skill added from the Library', () => {
    const out = withSkillMetadata(file('---\nname: x\nmetadata:\n  version: "3"\n---\nBody\n'), { version: '1.3.0', identity: 'agenthix/x' })
    expect(header(out).meta.metadata).toEqual({ version: '1.3.0', identity: 'agenthix/x' })
  })

  it('writes the version as a string, so "4" never reads as a number', () => {
    const out = withSkillMetadata(file('---\nname: x\n---\nBody\n'), { version: '4' })
    expect(out[0].content.toString()).toContain('version: "4"')
  })

  it('adds front matter to a SKILL.md that has none', () => {
    const out = withSkillMetadata(file('# Just a body\n'), { version: '1' })
    expect(header(out).meta).toEqual({ metadata: { version: '1' } })
    expect(out[0].content.toString()).toContain('# Just a body')
  })

  it('refuses a skill without SKILL.md, broken front matter, or metadata that is not a mapping', () => {
    expect(() => withSkillMetadata([{ path: 'README.md', content: Buffer.from('x') }], { version: '1' })).toThrow(/needs a SKILL.md/)
    expect(() => withSkillMetadata(file('---\nname: x\n'), { version: '1' })).toThrow(/never closed/)
    expect(() => withSkillMetadata(file('---\nname: [x\n---\n'), { version: '1' })).toThrow(/not valid YAML/)
    expect(() => withSkillMetadata(file('---\nmetadata: 3\n---\n'), { version: '1' })).toThrow(/metadata is not a list/)
  })

  it('writes the version into a top-level version: too when the file has one, since that one is read first', () => {
    const out = withSkillMetadata(file('---\nname: code-review\ndescription: Reviews\nversion: 2\n---\nBody\n'), { version: '2.1.0' })
    expect(header(out).meta).toEqual({ name: 'code-review', description: 'Reviews', version: '2.1.0', metadata: { version: '2.1.0' } })
  })

  it('writes a SemVer version into a package.json beside SKILL.md, keeping its other keys', () => {
    const files = [...file('---\nname: x\n---\nBody\n'), { path: 'package.json', content: Buffer.from('{"name":"x","version":"1.0.0","licence":"MIT"}') }]
    const out = withSkillMetadata(files, { version: '1.1.0' })
    expect(JSON.parse(out[2].content.toString())).toEqual({ name: 'x', version: '1.1.0', licence: 'MIT' })
  })

  it("leaves a package.json alone for a place's plain number, and refuses one that is not JSON", () => {
    const manifest = { path: 'package.json', content: Buffer.from('{"version":"1.0.0"}') }
    expect(withSkillMetadata([...file('---\nname: x\n---\n'), manifest], { version: '4' })[2]).toBe(manifest)
    expect(() => withSkillMetadata([...file('---\nname: x\n---\n'), { path: 'package.json', content: Buffer.from('{') }], { version: '1.1.0' })).toThrow(/package.json .* not valid JSON/)
  })
})
