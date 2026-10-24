/**
 * How the plain checks read a version's code (workflows spec part 1, *R1 · Plain checks*): each step's `run` and the
 * version's text files as numbered lines, and each line as shell commands — words with their quotes taken off, the
 * pipes between them, and every command substitution read as commands of its own. It is a reading for flagging,
 * not a shell: where it can't follow something, the rules that use it lean towards flagging.
 */
import { fileNamedByRun, type WorkflowVersionContent } from '@agenthix/core'

/** One logical line: `path` is a version file or `steps[i].run`; `line` the first physical line, from 1. */
export type CodeLine = { path: string; line: number; text: string }

export type Word = { raw: string; text: string }

/** One simple command. `pipedOut`: its output goes into the next command on the line. */
export type Segment = { words: Word[]; pipedOut: boolean; inSubstitution: boolean }

/** Files that explain rather than run, which the host rule doesn't read. */
const PROSE = /\.(md|markdown|txt|rst)$/i

export const runPath = (i: number): string => `steps[${i}].run`

export function textOf(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return text.includes('\0') ? null : text
  } catch {
    return null
  }
}

/** Lines ending in `\` are joined to the next, numbered from the first. */
export function linesOf(path: string, text: string): CodeLine[] {
  const out: CodeLine[] = []
  const physical = text.split('\n')
  for (let i = 0; i < physical.length; i++) {
    const start = i
    let line = physical[i].replace(/\r$/, '')
    while (line.endsWith('\\') && i + 1 < physical.length) line = line.slice(0, -1) + ' ' + physical[++i].replace(/\r$/, '')
    if (line.trim()) out.push({ path, line: start + 1, text: line })
  }
  return out
}

export function fileTexts(content: WorkflowVersionContent): Map<string, string | null> {
  return new Map(content.files.map((f) => [f.path, textOf(f.bytes)]))
}

/** The version's files a piece of code calls: by `./path`, `/run/workflow/path`, or beside the calling script. */
function filesCalledFrom(text: string, from: string | null, paths: string[]): string[] {
  const dir = from && from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : ''
  return paths.filter((p) => text.includes(`./${p}`) || text.includes(`/run/workflow/${p}`)
    || (dir && p.startsWith(dir) && text.includes(`./${p.slice(dir.length)}`)))
}

/** Every version file a step reaches: the one its `run` names, and what those call, as far as they go. */
export function filesReached(content: WorkflowVersionContent, stepIndex: number, texts = fileTexts(content)): string[] {
  const run = content.definition.steps[stepIndex].run
  const paths = [...texts.keys()]
  const reached = new Set<string>()
  const named = fileNamedByRun(run)
  const queue: string[] = []
  const add = (p: string) => { if (texts.has(p) && !reached.has(p)) { reached.add(p); queue.push(p) } }
  if (named) add(named)
  filesCalledFrom(run, null, paths).forEach(add)
  while (queue.length) {
    const p = queue.shift()!
    const text = texts.get(p)
    if (text) filesCalledFrom(text, p, paths).forEach(add)
  }
  return [...reached].sort()
}

/** A step's code: its `run`, then each text file it reaches. */
export function stepCode(content: WorkflowVersionContent, stepIndex: number, texts = fileTexts(content)): CodeLine[] {
  const lines = linesOf(runPath(stepIndex), content.definition.steps[stepIndex].run)
  for (const p of filesReached(content, stepIndex, texts)) {
    const text = texts.get(p)
    if (text) lines.push(...linesOf(p, text))
  }
  return lines
}

/** Every step's `run` and every text file that isn't prose. */
export function allCode(content: WorkflowVersionContent, texts = fileTexts(content)): CodeLine[] {
  const lines = content.definition.steps.flatMap((s, i) => linesOf(runPath(i), s.run))
  for (const [p, text] of texts) if (text !== null && !PROSE.test(p)) lines.push(...linesOf(p, text))
  return lines
}

/** The index of the `)` that closes the `(` at `open`, or the line's end. */
function closeParen(s: string, open: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (quote) { if (c === quote) quote = null; else if (c === '\\' && quote === '"') i++; continue }
    if (c === '\'' || c === '"') quote = c
    else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return i
  }
  return s.length
}

export function segmentsOf(line: string, inSubstitution = false): Segment[] {
  const out: Segment[] = []
  const subs: string[] = []
  let words: Word[] = []
  let raw = ''
  let text = ''
  let inWord = false
  const endWord = () => { if (inWord) words.push({ raw, text }); raw = ''; text = ''; inWord = false }
  const endSegment = (pipedOut: boolean) => {
    endWord()
    if (words.length) out.push({ words, pipedOut, inSubstitution })
    words = []
  }
  /** A `$(…)` or backtick substitution starting at `i`: kept in the word, read again as commands. Its end. */
  const substitution = (i: number): number => {
    if (line[i] === '`') {
      const end = line.indexOf('`', i + 1)
      const e = end < 0 ? line.length : end
      subs.push(line.slice(i + 1, e))
      return e
    }
    const end = closeParen(line, i + 1)
    subs.push(line.slice(i + 2, end))
    return end
  }
  let i = 0
  while (i < line.length) {
    const c = line[i]
    if (c === '\'') {
      const j = line.indexOf('\'', i + 1)
      const end = j < 0 ? line.length : j
      raw += line.slice(i, end + 1); text += line.slice(i + 1, end); inWord = true; i = end + 1
      continue
    }
    if (c === '"') {
      let j = i + 1
      let inner = ''
      while (j < line.length && line[j] !== '"') {
        if (line[j] === '\\' && j + 1 < line.length) { inner += line[j + 1]; j += 2; continue }
        if (line.startsWith('$(', j) || line[j] === '`') { const e = substitution(j); inner += line.slice(j, e + 1); j = e + 1; continue }
        inner += line[j++]
      }
      raw += line.slice(i, j + 1); text += inner; inWord = true; i = j + 1
      continue
    }
    if (c === '\\' && i + 1 < line.length) { raw += line.slice(i, i + 2); text += line[i + 1]; inWord = true; i += 2; continue }
    if (line.startsWith('$(', i) || c === '`') {
      const e = substitution(i)
      raw += line.slice(i, e + 1); text += line.slice(i, e + 1); inWord = true; i = e + 1
      continue
    }
    if (c === '#' && !inWord) break
    if (/\s/.test(c)) { endWord(); i++; continue }
    if (c === '|') { const or = line[i + 1] === '|'; endSegment(!or); i += or ? 2 : 1; continue }
    if (c === '&') { endSegment(false); i += line[i + 1] === '&' ? 2 : 1; continue }
    if (c === ';' || c === '(' || c === ')') { endSegment(false); i++; continue }
    if (c === '>' || c === '<') {
      endWord()
      let op = c
      i++
      while (line[i] === '>' || line[i] === '<' || line[i] === '&') op += line[i++]
      words.push({ raw: op, text: op })
      continue
    }
    raw += c; text += c; inWord = true; i++
  }
  endSegment(false)
  for (const s of subs) out.push(...segmentsOf(s, true))
  return out
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
const WRAPPERS = new Set(['sudo', 'env', 'exec', 'command', 'nohup', 'time', 'nice', 'builtin'])

/** Where a segment's command word is, past `NAME=value` and wrappers such as `sudo` and `env`; -1 for none. */
export function commandIndex(seg: Segment): number {
  let i = 0
  while (i < seg.words.length) {
    const w = seg.words[i].text
    if (ASSIGNMENT.test(seg.words[i].raw)) { i++; continue }
    if (WRAPPERS.has(w)) { i++; while (i < seg.words.length && seg.words[i].text.startsWith('-')) i++; continue }
    return i
  }
  return -1
}

/** The command's name, without its folder (`/usr/bin/git` is `git`); '' for none. */
export function commandName(seg: Segment): string {
  const i = commandIndex(seg)
  if (i < 0) return ''
  const w = seg.words[i].text
  return w.slice(w.lastIndexOf('/') + 1)
}

/** The words after the command word. */
export function argsOf(seg: Segment): Word[] {
  const i = commandIndex(seg)
  return i < 0 ? [] : seg.words.slice(i + 1)
}

/** The first argument that isn't an option, and its position among the arguments. */
export function firstOperand(args: Word[]): { word: Word; at: number } | null {
  for (let i = 0; i < args.length; i++) if (!args[i].text.startsWith('-')) return { word: args[i], at: i }
  return null
}

/** Every line of `lines` as commands, each knowing its line. */
export function commandsOf(lines: CodeLine[]): { at: CodeLine; segments: Segment[] }[] {
  return lines.map((at) => ({ at, segments: segmentsOf(at.text) }))
}
