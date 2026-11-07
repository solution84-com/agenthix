import { describe, expect, it } from 'vitest'
import { applyMarkdownFormat } from '../markdownFormat'

describe('the Markdown toolbar', () => {
  it('wraps the selection, and selects what it wrapped', () => {
    expect(applyMarkdownFormat('say hi now', 4, 6, 'bold')).toEqual({ value: 'say **hi** now', selectionStart: 6, selectionEnd: 8 })
  })

  it('puts a placeholder in where nothing is selected', () => {
    expect(applyMarkdownFormat('', 0, 0, 'link').value).toBe('[link text](https://)')
  })

  it('starts each selected line for a list, numbering a numbered one', () => {
    expect(applyMarkdownFormat('a\nb\nc', 0, 3, 'numbered').value).toBe('1. a\n2. b\nc')
    expect(applyMarkdownFormat('x\ntodo', 3, 3, 'checklist').value).toBe('x\n- [ ] todo')
  })
})
