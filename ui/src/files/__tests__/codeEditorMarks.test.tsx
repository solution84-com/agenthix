import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { CodeEditor } from '../../editor'

describe('CodeEditor marks its lines @SC-1626', () => {
  it('numbers from the line asked for, marks changed lines in the margin, and writes a problem under its line', () => {
    const { container, rerender } = render(
      <CodeEditor value={'one\ntwo\nthree'} fileName="SKILL.md" onChange={() => {}} firstLine={7}
        marks={[{ line: 2, kind: 'changed' }, { line: 3, kind: 'added' }, { line: 9, kind: 'added' }]}
        problems={[{ line: 3, text: 'scripts/x.py isn’t in the skill.' }]} />,
    )
    const numbers = [...container.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].map(e => e.textContent).filter(t => /^\d+$/.test(t ?? ''))
    expect(numbers).toContain('7')
    expect(numbers).toContain('9')
    expect(container.querySelectorAll('.cm-change-changed')).toHaveLength(1)
    expect(container.querySelectorAll('.cm-change-added')).toHaveLength(1)
    expect(container.querySelector('.cm-problem')?.textContent).toBe('✕ scripts/x.py isn’t in the skill.')
    rerender(<CodeEditor value={'one\ntwo\nthree'} fileName="SKILL.md" onChange={() => {}} />)
    expect(container.querySelector('.cm-problem')).toBeNull()
    expect(container.querySelectorAll('.cm-change-mark')).toHaveLength(0)
  })
})
