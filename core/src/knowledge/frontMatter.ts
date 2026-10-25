/**
 * A page's front matter, read and written in the small part of YAML pages use: one field per line, each value one
 * line of text (plain, or in single or double quotes) or a list of such values (`[a, b]`, or `- a` lines under the
 * field). Text, numbers and dates are all kept exactly as written (T3): `date: 2026-10-20` is the text
 * `2026-10-20`, never a date some reader converted.
 *
 * Anything outside that part is refused with where it is and what to do, not guessed at: nested fields, `|` and `>`
 * blocks, anchors, aliases and tags, a value running onto a second line, and a plain value holding `: ` (which real
 * YAML refuses too). So a page that passes here means the same to any YAML reader, and a hostile page cannot make
 * the reader expand, recurse or convert anything. The reader is one pass over the lines, with no backtracking
 * expressions, in plain TypeScript, so the site's gate, the itemiser and hq's editor in the browser run the same one.
 */
import { knowledgeProblem, type KnowledgePageProblem } from './problems.js'

export type FrontMatterValue = { kind: 'text'; text: string } | { kind: 'list'; items: string[] }

export interface FrontMatterField {
  name: string
  value: FrontMatterValue
  /** The 1-based line of the page the field starts on. */
  line: number
}

export interface FrontMatterParse {
  /** Whether the page starts with a front matter block at all. */
  present: boolean
  /** The fields read, in order, up to the first knowledgeProblem. Use them only when `problems` is empty. */
  fields: FrontMatterField[]
  problems: KnowledgePageProblem[]
  /** The text after the front matter, and the page's line it starts on. */
  body: string
  bodyLine: number
}

const DELIMITER = /^---[ \t]*$/
const CLOSERS = /^(?:---|\.\.\.)[ \t]*$/
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/
// C0 controls other than tab, and DEL. A tab is refused separately where it matters (indentation).
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/
const LIST_ITEM = /^( *)-(?: +(.*))?$/

class Refusal {
  constructor(readonly line: number, readonly why: string) {}
}

export function parseFrontMatter(page: string): FrontMatterParse {
  const text = page.charCodeAt(0) === 0xfeff ? page.slice(1) : page
  const lines = text.split(/\r?\n/)
  if (!DELIMITER.test(lines[0] ?? '')) {
    return { present: false, fields: [], problems: [knowledgeProblem.frontMatterMissing()], body: text, bodyLine: 1 }
  }
  let close = -1
  for (let i = 1; i < lines.length; i++) if (CLOSERS.test(lines[i])) { close = i; break }
  if (close < 0) {
    return {
      present: true, fields: [], body: '', bodyLine: lines.length + 1,
      problems: [knowledgeProblem.frontMatterInvalid(1, "it has no closing '---' line")],
    }
  }
  const body = lines.slice(close + 1).join('\n')
  const fields: FrontMatterField[] = []
  try {
    readFields(lines, 1, close, fields)
    return { present: true, fields, problems: [], body, bodyLine: close + 2 }
  } catch (e) {
    if (!(e instanceof Refusal)) throw e
    return { present: true, fields, problems: [knowledgeProblem.frontMatterInvalid(e.line, e.why)], body, bodyLine: close + 2 }
  }
}

const isSkippable = (line: string) => line.trim() === '' || line.trimStart().startsWith('#')

function readFields(lines: string[], from: number, to: number, out: FrontMatterField[]): void {
  const seen = new Set<string>()
  let i = from
  while (i < to) {
    const line = lines[i]
    const at = i + 1
    if (CONTROL.test(line)) throw new Refusal(at, 'it holds a control character')
    if (isSkippable(line)) { i++; continue }
    if (/^[ \t]/.test(line)) {
      throw new Refusal(at, line.trimStart().startsWith('-')
        ? 'a list item belongs under a field with nothing after its colon'
        : 'this line continues the one above: a value must be on one line, and fields cannot hold other fields')
    }
    const colon = fieldColon(line)
    if (colon < 0) throw new Refusal(at, "expected a field, written 'name: value'")
    const name = line.slice(0, colon)
    if (!FIELD_NAME.test(name)) {
      throw new Refusal(at, `'${name.slice(0, 40)}' is not a field name: use letters, digits, hyphens and underscores, starting with a letter`)
    }
    if (seen.has(name)) throw new Refusal(at, `'${name}' is given more than once`)
    seen.add(name)
    const raw = line.slice(colon + 1).trim()
    i++
    let value: FrontMatterValue
    if (raw === '' || raw.startsWith('#')) {
      const list = readBlockList(lines, i, to)
      i = list.next
      value = list.items ? { kind: 'list', items: list.items } : { kind: 'text', text: '' }
    } else {
      value = raw.startsWith('[') ? { kind: 'list', items: readFlowList(raw, at) } : { kind: 'text', text: readScalar(raw, at, false) }
      const next = nextContentLine(lines, i, to)
      if (next < to && /^[ \t]/.test(lines[next])) {
        throw new Refusal(next + 1, `this line continues '${name}': a value must be on one line, and fields cannot hold other fields`)
      }
    }
    out.push({ name, value, line: at })
  }
}

/** The colon that ends a field's name: followed by a space or the end of the line. */
function fieldColon(line: string): number {
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === ' ' || c === '#') return -1
    if (c === ':') return i + 1 === line.length || line[i + 1] === ' ' ? i : -1
  }
  return -1
}

function nextContentLine(lines: string[], from: number, to: number): number {
  let i = from
  while (i < to && isSkippable(lines[i])) i++
  return i
}

/** `- item` lines under a field. No such lines: the field is empty text. */
function readBlockList(lines: string[], from: number, to: number): { items: string[] | null; next: number } {
  let i = nextContentLine(lines, from, to)
  if (i >= to || !LIST_ITEM.test(lines[i])) {
    if (i < to && /^[ \t]/.test(lines[i])) {
      throw new Refusal(i + 1, 'fields cannot hold other fields: a value is text, a number, a date, or a list of them')
    }
    return { items: null, next: from }
  }
  const items: string[] = []
  while (i < to) {
    if (isSkippable(lines[i])) { i++; continue }
    if (CONTROL.test(lines[i])) throw new Refusal(i + 1, 'it holds a control character')
    if (lines[i].startsWith('\t') || /^ +\t/.test(lines[i])) throw new Refusal(i + 1, 'indent with spaces, not tabs')
    const m = LIST_ITEM.exec(lines[i])
    if (!m) {
      if (/^ /.test(lines[i])) throw new Refusal(i + 1, 'a list item is a single value on its own line')
      break
    }
    const raw = (m[2] ?? '').trim()
    if (raw === '' || raw.startsWith('#')) throw new Refusal(i + 1, 'a list item is empty')
    items.push(readScalar(raw, i + 1, true))
    i++
  }
  return { items, next: i }
}

/** `[a, "b, c", 'd']`: values only, never a list inside a list. */
function readFlowList(raw: string, line: number): string[] {
  const items: string[] = []
  let i = 1
  const skip = () => { while (raw[i] === ' ') i++ }
  skip()
  if (raw[i] === ']') return endOfFlow(raw, i + 1, line, items)
  for (;;) {
    skip()
    let item: string
    if (raw[i] === '"' || raw[i] === "'") {
      const q = readQuoted(raw, i, line)
      item = q.text
      i = q.end
    } else {
      const start = i
      if (i >= raw.length) throw new Refusal(line, "the list has no closing ']'")
      while (i < raw.length && raw[i] !== ',' && raw[i] !== ']') {
        if ('[{}'.includes(raw[i])) throw new Refusal(line, 'a list holds values, not other lists or fields')
        if (raw[i] === '#' && raw[i - 1] === ' ') throw new Refusal(line, "the list has no closing ']'")
        i++
      }
      item = raw.slice(start, i).trim()
      if (item === '') throw new Refusal(line, 'a list item is empty')
      checkPlain(item, line, true)
    }
    items.push(item)
    skip()
    if (raw[i] === ']') return endOfFlow(raw, i + 1, line, items)
    if (raw[i] !== ',') throw new Refusal(line, i >= raw.length ? "the list has no closing ']'" : 'list items are separated by commas')
    i++
    skip()
    if (raw[i] === ']') return endOfFlow(raw, i + 1, line, items)
  }
}

function endOfFlow(raw: string, from: number, line: number, items: string[]): string[] {
  trailing(raw.slice(from), line)
  return items
}

/** After a closed value only a comment may follow. */
function trailing(rest: string, line: number): void {
  if (rest.trim() !== '' && !/^\s+#/.test(rest)) throw new Refusal(line, 'something follows the value: put the whole value in quotes')
}

function readScalar(raw: string, line: number, inList: boolean): string {
  const c = raw[0]
  if (c === '"' || c === "'") {
    const q = readQuoted(raw, 0, line)
    trailing(raw.slice(q.end), line)
    return q.text
  }
  if (c === '[' && inList) throw new Refusal(line, 'a list holds values, not other lists')
  if (c === '{') throw new Refusal(line, 'a value cannot hold other fields: it is text, a number, a date, or a list of them')
  if (c === '|' || c === '>') throw new Refusal(line, "a value must be on one line ('|' and '>' blocks are not used)")
  const comment = raw.search(/\s#/)
  const text = (comment < 0 ? raw : raw.slice(0, comment)).trim()
  checkPlain(text, line, inList)
  return text
}

function checkPlain(text: string, line: number, inList: boolean): void {
  const c = text[0]
  if (c === '&' || c === '*' || c === '!') throw new Refusal(line, "anchors, aliases and tags ('&', '*', '!') are not used: put the value in quotes")
  if ('@`%'.includes(c) || ((c === '-' || c === '?' || c === ':') && (text.length === 1 || text[1] === ' ')) || c === ',' || c === ']' || c === '}') {
    throw new Refusal(line, `a value cannot start with '${c}' unless it is in quotes`)
  }
  if (text.includes(': ') || text.endsWith(':')) throw new Refusal(line, "put the value in quotes: it holds ': '")
  if (inList && (text.includes('{') || text.includes('}'))) throw new Refusal(line, 'put the value in quotes: it holds a brace')
}

// No escape makes a line break or a control character: a value is one line of text.
const ESCAPES: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', t: '\t', ' ': ' ' }

function readQuoted(raw: string, start: number, line: number): { text: string; end: number } {
  const quote = raw[start]
  let out = ''
  let i = start + 1
  while (i < raw.length) {
    const c = raw[i]
    if (quote === "'" && c === "'") {
      if (raw[i + 1] === "'") { out += "'"; i += 2; continue }
      return { text: out, end: i + 1 }
    }
    if (quote === '"' && c === '"') return { text: out, end: i + 1 }
    if (quote === '"' && c === '\\') {
      const e = raw[i + 1]
      if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(raw.slice(i + 2, i + 6))) {
        const ch = String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16))
        if (CONTROL.test(ch) || ch === '\n') throw new Refusal(line, 'a value cannot hold a line break or a control character')
        out += ch
        i += 6
        continue
      }
      if (e === undefined || !(e in ESCAPES)) throw new Refusal(line, `'\\${e ?? ''}' is not an escape a value may use`)
      out += ESCAPES[e]
      i += 2
      continue
    }
    out += c
    i++
  }
  throw new Refusal(line, 'the quotes are not closed on this line: a value must be on one line')
}

// ── Writing ──────────────────────────────────────────────────────────────────

/** Read back as some other kind of value by an ordinary YAML reader: quoted where the field must stay text. */
const LOOKS_TYPED = /^(?:true|false|yes|no|on|off|null|~|[-+]?(?:\.\d|\d)[\d._:eE+-]*)$/i

/** Whether `text` reads back, unquoted, as exactly itself. */
function plainIsSafe(text: string, inList: boolean): boolean {
  if (text === '' || text !== text.trim() || CONTROL.test(text) || text.includes('\t') || text.includes('\n')) return false
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(text)) return false
  if (text.includes(': ') || text.endsWith(':') || text.includes(' #')) return false
  if (inList && /[,[\]{}]/.test(text)) return false
  return true
}

function quoted(text: string): string {
  let out = '"'
  for (const c of text) {
    if (c === '"' || c === '\\') out += `\\${c}`
    else if (c === '\n') out += '\\n'
    else if (c === '\t') out += '\\t'
    else if (c === '\r') out += '\\r'
    else if (CONTROL.test(c)) out += `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
    else out += c
  }
  return `${out}"`
}

function scalar(text: string, mustStayText: boolean, inList: boolean): string {
  return plainIsSafe(text, inList) && !(mustStayText && LOOKS_TYPED.test(text)) ? text : quoted(text)
}

export interface PageFrontMatter {
  title: string
  description: string
  tags?: string[]
  /** The place's own fields, in the order to write them; each kept as written. */
  properties?: Record<string, string | string[]>
}

/**
 * The front matter block for these fields, ending in a newline, so `renderFrontMatter(f) + body` is a page. Values
 * the rules accept read back through `parseFrontMatter` as themselves.
 */
export function renderFrontMatter(fm: PageFrontMatter): string {
  const lines = ['---', `title: ${scalar(fm.title, true, false)}`, `description: ${scalar(fm.description, true, false)}`]
  if (fm.tags && fm.tags.length) lines.push(`tags: [${fm.tags.map(t => scalar(t, true, true)).join(', ')}]`)
  for (const [name, value] of Object.entries(fm.properties ?? {})) {
    lines.push(Array.isArray(value)
      ? `${name}: [${value.map(v => scalar(v, false, true)).join(', ')}]`
      : `${name}: ${value === '' ? '""' : scalar(value, false, false)}`)
  }
  lines.push('---', '')
  return lines.join('\n')
}
