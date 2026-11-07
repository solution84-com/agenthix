/** The tree's order, its dots, *Only changed*, the file the view opens on, and the steps between a file's changes. */
import { describe, it, expect } from 'vitest'
import type { BranchFileChange } from '@agenthix/core'
import { changedFolders, firstChanged, onlyChangedIn, openingFile, treeOrder } from '../components/changeMarks'
import { fileRows, stepTo } from '../components/fileRows'
import { matchesOf } from '../components/OpenAFile'

const ch = (path: string, status: BranchFileChange['status'] = 'modified'): BranchFileChange => ({ path, status, from: null, additions: 1, deletions: 0 })

describe('the tree', () => {
  it('lists folders first, then files, by name as the site sorts them, at every level', () => {
    expect(['src/App.tsx', 'README.md', 'src/pages/Login.tsx', 'docs/a.md', 'a.txt'].sort(treeOrder))
      .toEqual(['docs/a.md', 'src/pages/Login.tsx', 'src/App.tsx', 'README.md', 'a.txt'])
  })

  it('puts a dot on every folder holding a change, at any depth', () => {
    expect([...changedFolders([ch('src/pages/Login.tsx'), ch('docs/old.md', 'deleted'), ch('top.md')])].sort())
      .toEqual(['docs', 'src', 'src/pages'])
  })

  it('Only changed lists each folder’s changed sub-folders and files, deleted ones included', () => {
    const files = [ch('src/App.tsx'), ch('src/pages/Login.tsx', 'added'), ch('docs/old.md', 'deleted')]
    expect(onlyChangedIn(files, '')).toEqual({ folders: ['docs', 'src'], files: [] })
    expect(onlyChangedIn(files, 'src')).toEqual({ folders: ['src/pages'], files: [files[0]] })
  })
})

describe('the file the view opens on', () => {
  it('is the first changed file in the tree, one still there before a deleted one', () => {
    expect(firstChanged([ch('src/App.tsx'), ch('docs/old.md', 'deleted')])).toBe('src/App.tsx')
    expect(firstChanged([ch('docs/old.md', 'deleted')])).toBe('docs/old.md')
    expect(firstChanged([])).toBeNull()
  })

  it('without changes is the README, otherwise the first file', () => {
    const e = (name: string, kind: 'file' | 'dir' = 'file') => ({ name, path: name, kind })
    expect(openingFile([e('src', 'dir'), e('package.json'), e('Readme.md')])).toBe('Readme.md')
    expect(openingFile([e('src', 'dir'), e('package.json')])).toBe('package.json')
    expect(openingFile([e('src', 'dir')])).toBeNull()
  })
})

describe('a file’s changes', () => {
  it('counts a run of removed and added lines as one change', () => {
    const { rows, changes } = fileRows('a\nb\nc\nd\n', 'a\nB\nc\nD\nE\n', 'whole')
    expect(changes.map(i => rows[i].kind)).toEqual(['del', 'del'])
    expect(changes).toHaveLength(2)
  })

  it('an added file is one change of every line', () => {
    expect(fileRows(null, 'x\ny\n', 'whole').changes).toEqual([0])
  })

  it('steps to the next and previous change, held at the ends', () => {
    expect(stepTo(3, 0, 1)).toBe(1)
    expect(stepTo(3, 2, 1)).toBe(2)
    expect(stepTo(3, 0, -1)).toBe(0)
    expect(stepTo(0, 0, 1)).toBe(-1)
  })
})

describe('Open a file…', () => {
  it('lists names that start with what was typed first, then paths that hold it', () => {
    expect(matchesOf(['src/App.tsx', 'src/pages/Home.tsx', 'docs/app-notes.md', 'happy.txt'], 'app'))
      .toEqual(['src/App.tsx', 'docs/app-notes.md', 'happy.txt'])
    expect(matchesOf(['a'], '  ')).toEqual([])
  })
})
