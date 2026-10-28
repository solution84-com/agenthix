import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { diffLines, diffStats, withContext } from '../diff/diffLines'
import { FileDiff } from '../diff/FileDiff'
import { ChangesList, type FileChange } from '../diff/ChangesList'
import { changeLabel } from '../diff/changeMarker'

describe('diffLines', () => {
  it('marks removed and added lines with old and new numbers', () => {
    const lines = diffLines('a\nb\nc\n', 'a\nB\nc\nd\n')
    expect(lines.map(l => [l.kind, l.text, l.oldNo, l.newNo])).toEqual([
      ['same', 'a', 1, 1], ['del', 'b', 2, null], ['add', 'B', null, 2], ['same', 'c', 3, 3], ['add', 'd', null, 4],
    ])
    expect(diffStats(lines)).toEqual({ added: 2, removed: 1 })
  })

  it('treats an added file as all additions and a removed one as all removals', () => {
    expect(diffStats(diffLines('', 'x\ny\n'))).toEqual({ added: 2, removed: 0 })
    expect(diffStats(diffLines('x\ny\n', ''))).toEqual({ added: 0, removed: 2 })
  })

  it('finds no change in equal texts', () => {
    expect(diffStats(diffLines('a\nb', 'a\nb\n'))).toEqual({ added: 0, removed: 0 })
  })

  it('keeps unchanged lines around a change and names the lines left out', () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n')
    const after = before.replace('l10', 'changed')
    const rows = withContext(diffLines(before, after), 2)
    expect(rows[0]).toEqual({ kind: 'gap', hidden: 8 })
    expect(rows.filter(r => r.kind === 'gap')).toHaveLength(2)
    expect(rows.filter(r => r.kind === 'same')).toHaveLength(4)
  })

  it('does not stall on two large unrelated texts', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n')
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n')
    expect(diffStats(diffLines(a, b))).toEqual({ added: 3000, removed: 3000 })
  })
})

describe('FileDiff', () => {
  it('shows a sign and a name for every changed line, so colour is never the only cue', () => {
    const { container } = render(<FileDiff before={'a\nb\n'} after={'a\nc\n'} />)
    expect(container.querySelector('[data-line="del"]')?.textContent).toContain('−')
    expect(container.querySelector('[data-line="del"]')?.textContent).toContain('removed')
    expect(container.querySelector('[data-line="add"]')?.textContent).toContain('+')
    expect(container.querySelector('[data-line="add"]')?.textContent).toContain('added')
  })

  it('draws a line as text, never as HTML', () => {
    const { container } = render(<FileDiff before="" after={'<img src=x onerror=alert(1)>\n'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
  })

  it('puts no hex colour on the page', () => {
    const { container } = render(<FileDiff before="a" after="b" />)
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i)
  })

  it('says so when nothing changed', () => {
    render(<FileDiff before="same" after="same" />)
    expect(screen.getByText('No lines changed.')).toBeTruthy()
  })
})

describe('ChangesList', () => {
  const files: FileChange[] = [
    { path: 'SKILL.md', status: 'modified', before: 'a\n', after: 'b\n' },
    { path: 'scripts/format.py', status: 'added', before: null, after: 'x\ny\n' },
    { path: 'references/old.md', status: 'removed', before: 'gone\n', after: null },
    { path: 'references/style.md', status: 'renamed', oldPath: 'references/voice.md', before: 'v\n', after: 'v\n' },
    { path: 'assets/logo.png', status: 'modified', before: null, after: null, binary: true },
  ]

  it('lists each file with its marker named for assistive technology, and the old name of a rename', () => {
    render(<ChangesList files={files} />)
    expect(screen.getByLabelText('modified, 1 line added, 1 removed')).toBeTruthy()
    expect(screen.getByLabelText('added, 2 lines added')).toBeTruthy()
    expect(screen.getByLabelText('deleted, 2 removed'.replace('2 removed', '1 removed'))).toBeTruthy()
    expect(screen.getByLabelText('renamed')).toBeTruthy()
    expect(screen.getByText(/← references\/voice\.md/)).toBeTruthy()
    expect(screen.getByText('binary file')).toBeTruthy()
  })

  it('strikes a removed file through and keeps its lines folded until asked', () => {
    const { container } = render(<ChangesList files={files} />)
    const section = screen.getByRole('region', { name: 'references/old.md' })
    expect(section.querySelector('.line-through')).toBeTruthy()
    expect(section.querySelector('[data-line]')).toBeNull()
    fireEvent.click(section.querySelector('button')!)
    expect(section.querySelector('[data-line="del"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-line]').length).toBeGreaterThan(2)
  })

  it('offers the actions the screen supplies, per file', () => {
    render(<ChangesList files={files.slice(0, 1)} actions={f => <button>Undo {f.path}</button>} />)
    expect(screen.getByText('Undo SKILL.md')).toBeTruthy()
  })

  it('says so when no file changed', () => {
    render(<ChangesList files={[]} />)
    expect(screen.getByText('No files changed.')).toBeTruthy()
  })
})

describe('changeLabel', () => {
  it('reads like the board: "modified, 3 lines added, 1 removed"', () => {
    expect(changeLabel('modified', 3, 1)).toBe('modified, 3 lines added, 1 removed')
  })
})
