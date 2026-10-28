import { describe, it, expect } from 'vitest'
import { bumpOf, draftFiles, publishNote, publishRefusal, saveRefusal, starterFiles, DraftError } from '../drafts'

describe('the files a save sends @SC-1624', () => {
  it('reads text and base64 files', () => {
    const files = draftFiles([{ path: 'SKILL.md', text: '# Hi' }, { path: 'scripts/a.bin', base64: Buffer.from([1, 2]).toString('base64') }])
    expect(files.map(f => [f.path, [...f.content]])).toEqual([['SKILL.md', [...Buffer.from('# Hi')]], ['scripts/a.bin', [1, 2]]])
  })

  it("refuses package.json: the editor edits the asset, never its manifest, which is hq's", () => {
    expect(() => draftFiles([{ path: 'SKILL.md', text: 'x' }, { path: 'package.json', text: '{}' }])).toThrow(/manifest/)
  })

  it('refuses what is not a list of files, a file with no content, and both kinds of content at once', () => {
    expect(() => draftFiles('x' as never)).toThrow(DraftError)
    expect(() => draftFiles([{ path: 'SKILL.md' }])).toThrow(DraftError)
    expect(() => draftFiles([{ path: 'SKILL.md', text: 'a', base64: 'YQ==' }])).toThrow(DraftError)
    expect(() => draftFiles([])).toThrow(DraftError)
  })
})

describe('saving over a draft someone else changed @SC-1624', () => {
  it('refuses when the editor loaded an older revision than the newest', () => {
    expect(saveRefusal(3, 2)).toMatch(/revision 3.*Nothing was changed\./)
    expect(saveRefusal(3, 3)).toBeNull()
  })

  it('refuses a save from an editor that loaded a draft since published or discarded', () => {
    expect(saveRefusal(null, 2)).toMatch(/no longer/)
    expect(saveRefusal(null, null)).toBeNull()
  })

  it('takes no position when the saver names no revision (an agent proposing)', () => {
    expect(saveRefusal(3, undefined)).toBeNull()
  })
})

describe('publishing the exact revision seen (security review H5) @security-H5 @SC-1625', () => {
  it('refuses when the draft has a newer revision than the one the publisher saw', () => {
    expect(publishRefusal({ revision: 4 }, 3)).toMatch(/changed since you looked.*revision 4.*Nothing was changed\./)
    expect(publishRefusal({ revision: 4 }, 4)).toBeNull()
  })

  it('refuses when there is no draft, and when no revision is named', () => {
    expect(publishRefusal(null, 1)).toMatch(/no draft/)
    expect(publishRefusal({ revision: 1 }, undefined as never)).toMatch(/revision/)
  })
})

describe('what publishing asks for @SC-1625', () => {
  it('needs a note', () => {
    expect(() => publishNote('  ')).toThrow(/note/)
    expect(publishNote(' Tighter steps ')).toBe('Tighter steps')
  })

  it('makes the next minor version unless the publisher chooses patch or major', () => {
    expect(bumpOf(undefined)).toBe('minor')
    expect(bumpOf('patch')).toBe('patch')
    expect(bumpOf('major')).toBe('major')
    expect(() => bumpOf('huge')).toThrow(DraftError)
  })
})

describe('a new skill @SC-1624', () => {
  it('starts as a plain skill with its name and description', () => {
    const files = starterFiles('release-notes', 'Writes release notes. Use when asked for them.', 'plain')
    expect(files.map(f => f.path)).toEqual(['SKILL.md'])
    expect(files[0].content.toString()).toMatch(/^---\nname: release-notes\ndescription: "Writes release notes. Use when asked for them."\n---\n/)
  })

  it('can start with scripts/ and references/', () => {
    expect(starterFiles('x', 'd', 'scripts').map(f => f.path)).toEqual(['SKILL.md', 'references/README.md', 'scripts/README.md'])
  })
})
