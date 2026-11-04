import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { undo, undoDepth } from '@codemirror/commands'
import { CodeEditor, EDITOR_LIMIT, isOverEditorLimit } from '../../editor'
import { languageFor } from '../../editor/editorLanguage'

const viewOf = (container: HTMLElement) => EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement)!

describe('CodeEditor @SC-1626', () => {
  it('shows the text and reports an edit with the whole text', () => {
    const onChange = vi.fn()
    const { container } = render(<CodeEditor value="# Title" fileName="SKILL.md" onChange={onChange} />)
    const view = viewOf(container)
    expect(view.state.doc.toString()).toBe('# Title')
    view.dispatch({ changes: { from: 7, insert: '\nmore' } })
    expect(onChange).toHaveBeenCalledWith('# Title\nmore')
  })

  it('is read-only when asked, and when it has no way to report an edit', () => {
    const a = render(<CodeEditor value="x" fileName="a.json" onChange={() => {}} readOnly />)
    expect(viewOf(a.container).state.readOnly).toBe(true)
    const b = render(<CodeEditor value="x" fileName="a.json" />)
    expect(viewOf(b.container).state.readOnly).toBe(true)
    const c = render(<CodeEditor value="x" fileName="a.json" onChange={() => {}} />)
    expect(viewOf(c.container).state.readOnly).toBe(false)
  })

  it('opens text over 1 MB read-only and says so', () => {
    const big = 'a'.repeat(EDITOR_LIMIT + 1)
    expect(isOverEditorLimit(big)).toBe(true)
    expect(isOverEditorLimit('a'.repeat(EDITOR_LIMIT))).toBe(false)
    const { container, getByRole } = render(<CodeEditor value={big} fileName="data.yaml" onChange={() => {}} />)
    expect(viewOf(container).state.readOnly).toBe(true)
    expect(getByRole('status').textContent).toMatch(/over 1 MB.*read-only/)
  })

  it('takes a new text from outside', () => {
    const { container, rerender } = render(<CodeEditor value="one" fileName="a.md" onChange={() => {}} />)
    rerender(<CodeEditor value="two" fileName="a.md" onChange={() => {}} />)
    expect(viewOf(container).state.doc.toString()).toBe('two')
  })

  it('does not load the whole of a file over 1 MB into the editor', () => {
    const big = 'a'.repeat(EDITOR_LIMIT + 500)
    const { container } = render(<CodeEditor value={big} fileName="data.yaml" onChange={() => {}} />)
    expect(viewOf(container).state.doc.length).toBe(EDITOR_LIMIT)
  })

  it('keeps an outside change out of the undo history', () => {
    const { container, rerender } = render(<CodeEditor value="file A" fileName="a.md" onChange={() => {}} />)
    const view = viewOf(container)
    rerender(<CodeEditor value="file B" fileName="b.md" onChange={() => {}} />)
    expect(view.state.doc.toString()).toBe('file B')
    expect(undoDepth(view.state)).toBe(0)
    undo(view)
    expect(view.state.doc.toString()).toBe('file B')
  })

  it('puts no hex colour in the editor', () => {
    const { container } = render(<CodeEditor value="a: 1" fileName="a.yaml" />)
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})

describe('languageFor @SC-1626', () => {
  it('has a grammar for Markdown, YAML, JSON and scripts, and none for plain text', () => {
    for (const n of ['a.md', 'a.yaml', 'a.yml', 'a.json', 'a.sh', 'a.py', 'a.ts', 'a.js']) expect(languageFor(n)).not.toBeNull()
    expect(languageFor('notes.txt')).toBeNull()
    expect(languageFor('Makefile')).toBeNull()
  })
})
