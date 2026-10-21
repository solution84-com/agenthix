import { describe, it, expect } from 'vitest'
import { cutShort, plainText } from '../plainText'

describe('plain text for a card @SC-962', () => {
  it('drops headings, list marks, emphasis, code marks and link targets, and runs the lines together', () => {
    const md = '## Part 1\n\n**The personal space is empty.**\n- one `file.txt`\n- see [the run](https://x/y)\n\n> quoted _so_'
    expect(plainText(md)).toBe('Part 1 The personal space is empty. one file.txt see the run quoted _so_')
  })

  it('drops code fences and rules, and leaves plain words and snake_case alone', () => {
    expect(plainText('```bash\nls -la\n```\n---\nuse my_tool now')).toBe('ls -la use my_tool now')
    expect(plainText('2 * 3 = 6')).toBe('2 * 3 = 6')
  })

  it('cuts to a length with an ellipsis', () => {
    expect(cutShort('short', 10)).toBe('short')
    expect(cutShort('a'.repeat(20), 10)).toBe(`${'a'.repeat(9)}…`)
  })
})
