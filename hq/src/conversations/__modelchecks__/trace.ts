/**
 * What a failed run did, for the report: each call with its input cut short, each find_tools query with the names it
 * answered, and the final words. Written under the run's line, so a failure can be read without running it again.
 */
import { FIND_TOOLS } from './readCall'
import type { RunRecord } from './run'

const INPUT_AT_MOST = 240
const WORDS_AT_MOST = 400

const cut = (text: string, at: number) => (text.length > at ? `${text.slice(0, at)}…` : text)
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

/** The tool names a find_tools answer gave, or null when the result is not one. */
export function foundNames(result: unknown): string[] | null {
  const tools = result && typeof result === 'object' ? (result as { tools?: unknown }).tools : undefined
  if (!Array.isArray(tools)) return null
  return tools.flatMap(t => (t && typeof t === 'object' && typeof (t as { name?: unknown }).name === 'string' ? [(t as { name: string }).name] : []))
}

export function traceOf(run: RunRecord): string[] {
  const lines = run.calls.map(c => {
    if (c.name === FIND_TOOLS) {
      const query = c.input && typeof c.input === 'object' ? (c.input as { query?: unknown }).query : undefined
      const found = c.found === undefined ? '' : ` → ${c.found.length > 0 ? c.found.join(', ') : 'nothing'}`
      return `round ${c.round + 1} · find_tools ${JSON.stringify(query ?? null)}${found}`
    }
    return `round ${c.round + 1} · ${c.name} ${cut(oneLine(JSON.stringify(c.input ?? {})), INPUT_AT_MOST)}`
  })
  const words = run.answer ?? run.texts.filter(t => t.trim()).at(-1) ?? ''
  const end = run.answer === null ? 'no answer; the last words' : 'answer'
  lines.push(`${end}: ${words.trim() ? JSON.stringify(cut(oneLine(words), WORDS_AT_MOST)) : '(none)'}`)
  return lines
}
