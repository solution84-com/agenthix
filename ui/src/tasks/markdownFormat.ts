/** What a Markdown toolbar button does to the text: wraps the selection, or starts each selected line. */
export type MarkdownFormat = 'heading' | 'bold' | 'italic' | 'bullet' | 'numbered' | 'checklist' | 'link' | 'code'

export interface MarkdownEdit {
  value: string
  selectionStart: number
  selectionEnd: number
}

const WRAP: Partial<Record<MarkdownFormat, [string, string, string]>> = {
  bold: ['**', '**', 'bold text'],
  italic: ['_', '_', 'italic text'],
  code: ['`', '`', 'code'],
  link: ['[', '](https://)', 'link text'],
}

const LINE: Partial<Record<MarkdownFormat, (i: number) => string>> = {
  heading: () => '## ',
  bullet: () => '- ',
  numbered: i => `${i + 1}. `,
  checklist: () => '- [ ] ',
}

/** The text after a toolbar button, with the selection on what was formatted (or on the placeholder put in). */
export function applyMarkdownFormat(value: string, start: number, end: number, format: MarkdownFormat): MarkdownEdit {
  const wrap = WRAP[format]
  if (wrap) {
    const [open, close, placeholder] = wrap
    const selected = value.slice(start, end) || placeholder
    const next = value.slice(0, start) + open + selected + close + value.slice(end)
    return { value: next, selectionStart: start + open.length, selectionEnd: start + open.length + selected.length }
  }
  const prefix = LINE[format]!
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEndAt = value.indexOf('\n', end)
  const lineEnd = lineEndAt === -1 ? value.length : lineEndAt
  const lines = value.slice(lineStart, lineEnd).split('\n').map((l, i) => prefix(i) + l)
  const block = lines.join('\n')
  const next = value.slice(0, lineStart) + block + value.slice(lineEnd)
  return { value: next, selectionStart: lineStart, selectionEnd: lineStart + block.length }
}
