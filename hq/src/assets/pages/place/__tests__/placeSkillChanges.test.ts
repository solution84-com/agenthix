import { describe, expect, it } from 'vitest'
import { placeSkillChanges, type SkillFiles } from '../placeSkillChanges'

const b64 = (t: string | Uint8Array) => Buffer.from(t).toString('base64')

const data = (over: Partial<SkillFiles> = {}): SkillFiles => ({
  fingerprint: 'f', current: true, newestVersion: 1,
  files: [{ path: 'SKILL.md', base64: b64('one\ntwo\n') }, { path: 'scripts/x.sh', base64: b64('echo hi') }],
  changes: { added: ['scripts/x.sh'], changed: ['SKILL.md'], removed: ['old.md'] },
  before: [{ path: 'SKILL.md', base64: b64('one\n') }, { path: 'old.md', base64: b64('gone') }],
  ...over,
})

describe("a place skill's changes since its newest version", () => {
  it('gives each changed file its text then and now, an added file only now, a removed one only then', () => {
    expect(placeSkillChanges(data())).toEqual([
      { path: 'SKILL.md', status: 'modified', before: 'one\n', after: 'one\ntwo\n', binary: false },
      { path: 'old.md', status: 'removed', before: 'gone', after: null, binary: false },
      { path: 'scripts/x.sh', status: 'added', before: null, after: 'echo hi', binary: false },
    ])
  })

  it('lists a binary file as changed, with no lines', () => {
    const png = new Uint8Array([0x89, 0x50, 0xff, 0xfe, 0x00])
    const changes = placeSkillChanges(data({
      files: [{ path: 'logo.png', base64: b64(png) }],
      changes: { added: [], changed: ['logo.png'], removed: [] },
      before: [{ path: 'logo.png', base64: b64(new Uint8Array([0xff, 0xfe])) }],
    }))
    expect(changes).toEqual([{ path: 'logo.png', status: 'modified', before: null, after: null, binary: true }])
  })
})
