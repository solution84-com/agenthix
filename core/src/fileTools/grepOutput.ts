/**
 * ripgrep's output read into Grep's results, and Grep's own wording for them, as Claude Code's Grep tool gives them
 * (observed in Claude Code 2.1.289): content lines `file:12:text` (a context line `file-12-text`, a break `--`),
 * counts `file:3`, files listed newest first, a default `head_limit` of 250 (0 for no limit), and the pagination note.
 */
import { GREP_LIMITS } from './grepArgs.js'

export type ContentLine =
  | { kind: 'match' | 'context'; file: string; line: number; text: string }
  | { kind: 'binary'; file: string; text: string }
  | { kind: 'break' }

type Page = { appliedLimit?: number; appliedOffset?: number; nextOffset?: number; incomplete: boolean }

export type GrepContent = Page & { ok: true; mode: 'content'; lines: ContentLine[]; showLineNumbers: boolean; numLines: number; totalLines: number }
export type GrepCount = Page & { ok: true; mode: 'count'; counts: { file: string; count: number }[]; numFiles: number; numMatches: number }
export type GrepFiles = Page & { ok: true; mode: 'files_with_matches'; filenames: string[]; numFiles: number; totalFiles: number }
export type GrepFound = GrepContent | GrepCount | GrepFiles

const LONG_LINE = { match: '[Omitted long matching line]', context: '[Omitted long context line]' } as const

/** A path as ripgrep printed it, relative to the root: `./a.md` → `a.md`. */
export function rootRelative(file: string): string {
  return file.startsWith('./') ? file.slice(2) : file
}

type RgText = { text?: string; bytes?: string }
type RgEvent = {
  type?: string
  data?: { path?: RgText; lines?: RgText; line_number?: number; binary_offset?: number }
}

function decode(t: RgText | undefined): string {
  if (!t) return ''
  if (typeof t.text === 'string') return t.text
  return Buffer.from(t.bytes ?? '', 'base64').toString('utf8')
}

/** `--json` output to content lines; `complete` is false when the output was cut, so a file's last lines are kept. */
export function parseJsonContent(stdout: string, contextBreaks: boolean, complete: boolean): ContentLine[] {
  const out: ContentLine[] = []
  let pending: ContentLine[] = []
  let lastFile: string | null = null
  let lastLine = -1
  for (const raw of stdout.split('\n')) {
    if (!raw.startsWith('{')) continue
    let ev: RgEvent
    try {
      ev = JSON.parse(raw) as RgEvent
    } catch {
      continue
    }
    const data = ev.data ?? {}
    if (ev.type === 'begin') {
      pending = []
      continue
    }
    if (ev.type === 'end') {
      if (typeof data.binary_offset === 'number') {
        // A binary file's matched lines are not shown; ripgrep's note stands for them.
        if (pending.length > 0) {
          out.push({ kind: 'binary', file: rootRelative(decode(data.path)), text: `binary file matches (found "\\0" byte around offset ${data.binary_offset})` })
        }
      } else out.push(...pending)
      pending = []
      continue
    }
    if (ev.type !== 'match' && ev.type !== 'context') continue
    const file = rootRelative(decode(data.path))
    const first = data.line_number ?? 0
    const texts = decode(data.lines).replace(/\r?\n$/, '').split('\n').map(l => l.replace(/\r$/, ''))
    if (contextBreaks && lastFile !== null && (file !== lastFile || first > lastLine + 1)) pending.push({ kind: 'break' })
    texts.forEach((text, i) => {
      const shown = text.length > GREP_LIMITS.maxColumns ? LONG_LINE[ev.type as 'match' | 'context'] : text
      pending.push({ kind: ev.type as 'match' | 'context', file, line: first + i, text: shown })
    })
    lastFile = file
    lastLine = first + texts.length - 1
  }
  if (!complete) out.push(...pending)
  return out
}

/** `--null` output of `--files-with-matches`: one name per NUL; whatever follows the last NUL (a cut name) is dropped. */
export function parseNullFiles(stdout: string): string[] {
  const parts = stdout.split('\0')
  parts.pop()
  return parts.map(p => rootRelative(p.replace(/^\n/, ''))).filter(Boolean)
}

/** `--null` output of `--count`: `file\0N\n` per file. */
export function parseNullCounts(stdout: string): { file: string; count: number }[] {
  const out: { file: string; count: number }[] = []
  const re = /([^\0]*)\0:?(\d+)(?:\n|$)/gy
  for (let m = re.exec(stdout); m !== null; m = re.exec(stdout)) {
    const count = Number(m[2])
    if (count > 0) out.push({ file: rootRelative(m[1]), count })
  }
  return out
}

export function paginate<T>(items: T[], headLimit: number | undefined, offset: number): { items: T[]; appliedLimit?: number } {
  if (headLimit === 0) return { items: items.slice(offset) }
  const limit = headLimit ?? GREP_LIMITS.defaultHeadLimit
  const cut = items.length - offset > limit
  return { items: items.slice(offset, offset + limit), ...(cut ? { appliedLimit: limit } : {}) }
}

export function pageOf(appliedLimit: number | undefined, offset: number, incomplete: boolean): Page {
  return {
    ...(appliedLimit !== undefined ? { appliedLimit, nextOffset: offset + appliedLimit } : {}),
    ...(offset > 0 ? { appliedOffset: offset } : {}),
    incomplete,
  }
}

export function formatContentLine(l: ContentLine, showLineNumbers: boolean): string {
  if (l.kind === 'break') return '--'
  if (l.kind === 'binary') return `${l.file}:${l.text}`
  const sep = l.kind === 'match' ? ':' : '-'
  return showLineNumbers ? `${l.file}${sep}${l.line}${sep}${l.text}` : `${l.file}${sep}${l.text}`
}

function paginationNote(r: Page): string {
  const parts: string[] = []
  if (r.appliedLimit !== undefined) parts.push(`limit: ${r.appliedLimit}`)
  if (r.appliedOffset) parts.push(`offset: ${r.appliedOffset}`)
  return parts.join(', ')
}

const plural = (n: number, word: string) => `${word}${n === 1 ? '' : 's'}`

/** The text Claude Code's Grep gives the model for a result. */
export function formatGrepResult(r: GrepFound): string {
  const note = paginationNote(r)
  if (r.mode === 'content') {
    const content = r.lines.map(l => formatContentLine(l, r.showLineNumbers)).join('\n')
    const body = content || (r.appliedOffset && r.totalLines > 0 ? 'No entries at this offset' : 'No matches found')
    return note ? `${body}\n[Showing results with pagination = ${note}]` : body
  }
  if (r.mode === 'count') {
    const content = r.counts.map(c => `${c.file}:${c.count}`).join('\n')
    const body = content || (r.numMatches > 0 ? 'No entries at this offset' : 'No matches found')
    return `${body}\nFound ${r.numMatches} total ${plural(r.numMatches, 'occurrence')} across ${r.numFiles} ${plural(r.numFiles, 'file')}.${note ? ` with pagination = ${note}` : ''}`
  }
  if (r.filenames.length === 0) {
    return r.appliedOffset && r.totalFiles > 0 ? `No entries at this offset. [Showing results with pagination = ${note}]` : 'No files found'
  }
  return `Found ${r.filenames.length} ${plural(r.filenames.length, 'file')}${note ? ` ${note}` : ''}\n${r.filenames.join('\n')}`
}
