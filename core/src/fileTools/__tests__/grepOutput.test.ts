import { describe, expect, it } from 'vitest'
import {
  formatGrepResult,
  pageOf,
  paginate,
  parseJsonContent,
  parseNullCounts,
  parseNullFiles,
  type ContentLine,
  type GrepFound,
} from '../grepOutput.js'

const ev = (type: string, data: object) => JSON.stringify({ type, data })
const p = (text: string) => ({ text })

function jsonOf(...events: string[]): string {
  return events.join('\n') + '\n'
}

describe('reading ripgrep\'s --json output @SC-1374', () => {
  it('gives match and context lines, relative to the root, with breaks between groups and files', () => {
    const out = jsonOf(
      ev('begin', { path: p('./a.md') }),
      ev('match', { path: p('./a.md'), lines: p('one\n'), line_number: 1 }),
      ev('context', { path: p('./a.md'), lines: p('two\n'), line_number: 2 }),
      ev('match', { path: p('./a.md'), lines: p('nine\r\n'), line_number: 9 }),
      ev('end', { path: p('./a.md') }),
      ev('begin', { path: p('./sub/b.md') }),
      ev('match', { path: p('./sub/b.md'), lines: p('three\n'), line_number: 3 }),
      ev('end', { path: p('./sub/b.md') }),
    )
    expect(parseJsonContent(out, true, true)).toEqual([
      { kind: 'match', file: 'a.md', line: 1, text: 'one' },
      { kind: 'context', file: 'a.md', line: 2, text: 'two' },
      { kind: 'break' },
      { kind: 'match', file: 'a.md', line: 9, text: 'nine' },
      { kind: 'break' },
      { kind: 'match', file: 'sub/b.md', line: 3, text: 'three' },
    ])
    expect(parseJsonContent(out, false, true).some(l => l.kind === 'break')).toBe(false)
  })
  it('numbers each line of a multiline match', () => {
    const out = jsonOf(ev('begin', {}), ev('match', { path: p('a.md'), lines: p('x\ny\n'), line_number: 4 }), ev('end', {}))
    expect(parseJsonContent(out, false, true)).toEqual([
      { kind: 'match', file: 'a.md', line: 4, text: 'x' },
      { kind: 'match', file: 'a.md', line: 5, text: 'y' },
    ])
  })
  it('replaces a line over 500 characters, and a binary file\'s matches by ripgrep\'s note', () => {
    const out = jsonOf(
      ev('begin', {}),
      ev('match', { path: p('a.md'), lines: p('a'.repeat(501)), line_number: 1 }),
      ev('end', {}),
      ev('begin', {}),
      ev('match', { path: { bytes: Buffer.from('b.bin').toString('base64') }, lines: { bytes: 'AAE=' }, line_number: 1 }),
      ev('end', { path: p('b.bin'), binary_offset: 7 }),
    )
    expect(parseJsonContent(out, false, true)).toEqual([
      { kind: 'match', file: 'a.md', line: 1, text: '[Omitted long matching line]' },
      { kind: 'binary', file: 'b.bin', text: 'binary file matches (found "\\0" byte around offset 7)' },
    ])
  })
  it('keeps the lines of a file whose end was cut off', () => {
    const out = jsonOf(ev('begin', {}), ev('match', { path: p('a.md'), lines: p('x\n'), line_number: 1 })) + '{"type":"ma'
    expect(parseJsonContent(out, false, false)).toEqual([{ kind: 'match', file: 'a.md', line: 1, text: 'x' }])
    expect(parseJsonContent(out, false, true)).toEqual([])
  })
})

describe('reading ripgrep\'s --null output @SC-1374', () => {
  it('lists files and drops a cut last name', () => {
    expect(parseNullFiles('./a.md\0sub/b.md\0')).toEqual(['a.md', 'sub/b.md'])
    expect(parseNullFiles('./a.md\0sub/b.m')).toEqual(['a.md'])
  })
  it('reads counts, names with colons included', () => {
    expect(parseNullCounts('./a:b.md\x002\nsub/c.md\x001\n')).toEqual([{ file: 'a:b.md', count: 2 }, { file: 'sub/c.md', count: 1 }])
  })
})

describe('pagination as Grep does it @SC-1374', () => {
  const items = Array.from({ length: 300 }, (_, i) => i)
  it('shows 250 by default and says so only when it cut', () => {
    expect(paginate(items, undefined, 0)).toMatchObject({ appliedLimit: 250 })
    expect(paginate(items, undefined, 0).items).toHaveLength(250)
    expect(paginate(items.slice(0, 10), undefined, 0)).toEqual({ items: items.slice(0, 10) })
  })
  it('takes 0 as no limit, and skips offset first', () => {
    expect(paginate(items, 0, 0).items).toHaveLength(300)
    expect(paginate(items, 5, 10)).toEqual({ items: [10, 11, 12, 13, 14], appliedLimit: 5 })
  })
  it('gives the caller the next offset when cut', () => {
    expect(pageOf(5, 10, false)).toEqual({ appliedLimit: 5, nextOffset: 15, appliedOffset: 10, incomplete: false })
    expect(pageOf(undefined, 0, true)).toEqual({ incomplete: true })
  })
})

describe('Grep\'s wording @SC-1374', () => {
  const lines: ContentLine[] = [
    { kind: 'match', file: 'a.md', line: 1, text: 'one' },
    { kind: 'context', file: 'a.md', line: 2, text: 'two' },
    { kind: 'break' },
    { kind: 'binary', file: 'b.bin', text: 'binary file matches (found "\\0" byte around offset 7)' },
  ]
  const content = (over: Partial<Extract<GrepFound, { mode: 'content' }>>): GrepFound => ({
    ok: true, mode: 'content', lines, showLineNumbers: true, numLines: lines.length, totalLines: lines.length, incomplete: false, ...over,
  })
  it('content: file:line:text, file-line-text for context, -- between groups', () => {
    expect(formatGrepResult(content({}))).toBe('a.md:1:one\na.md-2-two\n--\nb.bin:binary file matches (found "\\0" byte around offset 7)')
    expect(formatGrepResult(content({ showLineNumbers: false })).split('\n').slice(0, 2)).toEqual(['a.md:one', 'a.md-two'])
  })
  it('content: the pagination note, and nothing found', () => {
    expect(formatGrepResult(content({ appliedLimit: 4, appliedOffset: 2 }))).toMatch(/\n\[Showing results with pagination = limit: 4, offset: 2\]$/)
    expect(formatGrepResult(content({ lines: [], totalLines: 0 }))).toBe('No matches found')
    expect(formatGrepResult(content({ lines: [], totalLines: 3, appliedOffset: 5 }))).toBe('No entries at this offset\n[Showing results with pagination = offset: 5]')
  })
  it('count: file:N lines and the total', () => {
    const r: GrepFound = { ok: true, mode: 'count', counts: [{ file: 'a.md', count: 2 }, { file: 'b.md', count: 1 }], numFiles: 2, numMatches: 3, incomplete: false }
    expect(formatGrepResult(r)).toBe('a.md:2\nb.md:1\nFound 3 total occurrences across 2 files.')
    expect(formatGrepResult({ ...r, counts: [{ file: 'a.md', count: 1 }], numFiles: 1, numMatches: 1, appliedLimit: 1 })).toBe(
      'a.md:1\nFound 1 total occurrence across 1 file. with pagination = limit: 1',
    )
    expect(formatGrepResult({ ...r, counts: [], numFiles: 0, numMatches: 0 })).toBe('No matches found\nFound 0 total occurrences across 0 files.')
  })
  it('files: Found N files and the list, or No files found', () => {
    const r: GrepFound = { ok: true, mode: 'files_with_matches', filenames: ['b.md', 'a.md'], numFiles: 2, totalFiles: 2, incomplete: false }
    expect(formatGrepResult(r)).toBe('Found 2 files\nb.md\na.md')
    expect(formatGrepResult({ ...r, filenames: ['b.md'], numFiles: 1, appliedLimit: 1 })).toBe('Found 1 file limit: 1\nb.md')
    expect(formatGrepResult({ ...r, filenames: [], numFiles: 0, totalFiles: 0 })).toBe('No files found')
    expect(formatGrepResult({ ...r, filenames: [], numFiles: 0, appliedOffset: 9 })).toBe('No entries at this offset. [Showing results with pagination = offset: 9]')
  })
})
