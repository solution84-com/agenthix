import { describe, expect, it } from 'vitest'
import { changedLines, foldersOf, pathTree, treeFiles } from '../pathTree'

describe("a skill's files as a tree (board *A skill's page*) @SC-1632", () => {
  it('lists folders first, then files, each by name, at every level', () => {
    const tree = pathTree(['SKILL.md', 'scripts/format.py', 'references/README.md', 'references/deep/a.md', 'LICENSE'])
    expect(tree.folders.map(f => f.name)).toEqual(['references', 'scripts'])
    expect(tree.files).toEqual(['LICENSE', 'SKILL.md'])
    expect(treeFiles(tree)).toEqual(['references/deep/a.md', 'references/README.md', 'scripts/format.py', 'LICENSE', 'SKILL.md'])
  })

  it('dots every folder that holds a change, at any depth', () => {
    expect([...foldersOf(['references/deep/a.md', 'SKILL.md'])].sort()).toEqual(['references', 'references/deep'])
  })
})

describe('changed lines, for the margin (board *The editor*) @SC-1626', () => {
  it('marks added lines as added and replaced lines as changed, by their number now', () => {
    expect(changedLines('a\nb\nc\n', 'a\nB\nc\nd\n')).toEqual([{ line: 2, kind: 'changed' }, { line: 4, kind: 'added' }])
  })

  it('marks the line after a removal as changed', () => {
    expect(changedLines('a\nb\nc\n', 'a\nc\n')).toEqual([{ line: 2, kind: 'changed' }])
  })

  it('marks nothing when nothing changed', () => {
    expect(changedLines('a\n', 'a\n')).toEqual([])
  })
})
