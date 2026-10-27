/** Where the first mistake in a JSON text is: its line and column, both counted from 1. */
export interface JsonProblem {
  line: number
  column: number
}

const MAX_DEPTH = 1000

/**
 * Finds the first place `text` stops being JSON. Only called once the engine's own parser has refused the text, because
 * engines word their errors differently (some give no position at all) and the line must come out the same everywhere.
 */
export function findJsonProblem(text: string): JsonProblem {
  let i = 0
  const fail = (at = i): never => { throw at }
  const space = () => { while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++ }
  const literal = (word: string) => { if (!text.startsWith(word, i)) fail(); i += word.length }
  const string = () => {
    i++
    while (i < text.length) {
      const ch = text[i]!
      if (ch === '"') { i++; return }
      if (ch < ' ') fail()
      if (ch === '\\') {
        const next = text[i + 1]
        if (next === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail(i)
          i += 6
        } else if (next !== undefined && '"\\/bfnrt'.includes(next)) i += 2
        else fail(i)
      } else i++
    }
    fail(text.length)
  }
  const number = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 400))
    if (!m) fail()
    i += m![0].length
  }
  const value = (depth: number): void => {
    if (depth > MAX_DEPTH) fail()
    space()
    const ch = text[i]
    if (ch === '{') {
      i++; space()
      if (text[i] === '}') { i++; return }
      for (;;) {
        space()
        if (text[i] !== '"') fail()
        string(); space()
        if (text[i] !== ':') fail()
        i++; value(depth + 1); space()
        if (text[i] === ',') { i++; continue }
        if (text[i] === '}') { i++; return }
        fail()
      }
    } else if (ch === '[') {
      i++; space()
      if (text[i] === ']') { i++; return }
      for (;;) {
        value(depth + 1); space()
        if (text[i] === ',') { i++; continue }
        if (text[i] === ']') { i++; return }
        fail()
      }
    } else if (ch === '"') string()
    else if (ch === 't') literal('true')
    else if (ch === 'f') literal('false')
    else if (ch === 'n') literal('null')
    else number()
  }
  let at = text.length
  try {
    value(0); space()
    if (i < text.length) fail()
  } catch (offset) {
    if (typeof offset !== 'number') throw offset
    at = offset
  }
  const before = text.slice(0, at)
  const line = before.split('\n').length
  return { line, column: at - (before.lastIndexOf('\n') + 1) + 1 }
}

export type JsonParsed = { ok: true; value: unknown } | { ok: false; problem: JsonProblem }

export function parseJson(text: string): JsonParsed {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  try {
    return { ok: true, value: JSON.parse(body) }
  } catch {
    return { ok: false, problem: findJsonProblem(body) }
  }
}
