import { describe, it, expect } from 'vitest'
import { bytesOfText, type EditorFile } from '../editorFiles'
import { changeSummary, changesBetween, treeRows } from '../changeSet'

const f = (path: string, text: string): EditorFile => ({ path, bytes: bytesOfText(text) })

const base = [f('SKILL.md', 'a\nb\n'), f('scripts/collect.sh', 'x\n'), f('references/voice.md', 'voice\n'), f('references/old-template.md', 'old\n')]

describe('changesBetween @SC-1626', () => {
  it('marks added, modified and removed files, and leaves the unchanged out', () => {
    const now = [f('SKILL.md', 'a\nb\nc\n'), f('scripts/collect.sh', 'x\n'), f('scripts/format.py', 'print()\n'), f('references/voice.md', 'voice\n')]
    const changes = changesBetween(base, now)
    expect(changes.map(c => [c.path, c.status])).toEqual([
      ['SKILL.md', 'modified'], ['references/old-template.md', 'removed'], ['scripts/format.py', 'added'],
    ])
  })

  it('reads a removed file and an added one holding the same bytes as a rename, with the old name', () => {
    const now = [f('SKILL.md', 'a\nb\n'), f('scripts/collect.sh', 'x\n'), f('references/style.md', 'voice\n'), f('references/old-template.md', 'old\n')]
    const renamed = changesBetween(base, now).find(c => c.status === 'renamed')
    expect(renamed).toMatchObject({ path: 'references/style.md', oldPath: 'references/voice.md' })
    expect(changesBetween(base, now).some(c => c.path === 'references/voice.md')).toBe(false)
  })

  it('keeps a rename that was also edited as one rename when the editor recorded it', () => {
    const now = [f('SKILL.md', 'a\nb\n'), f('scripts/collect.sh', 'x\n'), f('references/style.md', 'voice, edited\n'), f('references/old-template.md', 'old\n')]
    const renames = new Map([['references/style.md', 'references/voice.md']])
    const renamed = changesBetween(base, now, renames).find(c => c.status === 'renamed')
    expect(renamed).toMatchObject({ path: 'references/style.md', oldPath: 'references/voice.md', before: 'voice\n', after: 'voice, edited\n' })
  })

  it('does not pair empty files into renames', () => {
    const b = [f('a.txt', '')]
    const now = [f('b.txt', '')]
    expect(changesBetween(b, now).map(c => c.status).sort()).toEqual(['added', 'removed'])
  })

  it('lists a binary file as changed without lines', () => {
    const png: EditorFile = { path: 'assets/logo.png', bytes: new Uint8Array([137, 80, 0, 71]) }
    const changes = changesBetween([], [png])
    expect(changes[0]).toMatchObject({ status: 'added', binary: true, after: null })
  })
})

describe('treeRows @SC-1626', () => {
  it('keeps a deleted file in the tree, and counts lines for the others', () => {
    const now = [f('SKILL.md', 'a\nb\nc\n'), f('scripts/collect.sh', 'x\n'), f('references/voice.md', 'voice\n')]
    const rows = treeRows(base, now)
    expect(rows.find(r => r.path === 'references/old-template.md')).toMatchObject({ status: 'removed' })
    expect(rows.find(r => r.path === 'SKILL.md')).toMatchObject({ status: 'modified', added: 1, removed: 0 })
    expect(rows.find(r => r.path === 'scripts/collect.sh')?.status).toBeNull()
  })
})

describe('changeSummary @SC-1626', () => {
  it('says how many files changed and how', () => {
    const now = [f('SKILL.md', 'a\nb\nc\n'), f('scripts/collect.sh', 'x\n'), f('scripts/format.py', 'p\n'), f('references/voice.md', 'voice\n')]
    expect(changeSummary(changesBetween(base, now))).toBe('3 files changed: 1 added, 1 modified, 1 deleted')
    expect(changeSummary([])).toBe('No files changed')
  })
})
