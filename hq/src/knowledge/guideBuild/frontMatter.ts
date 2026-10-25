import { parse } from 'yaml'

export type SplitPage = { data: Record<string, unknown>; body: string }

/** A page's front matter and the text after it. A page with none has empty data; front matter that is not a mapping throws. */
export function splitFrontMatter(source: string, name: string): SplitPage {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source)
  if (!m) return { data: {}, body: source }
  let data: unknown
  try {
    data = parse(m[1])
  } catch {
    throw new Error(`The front matter of ${name} does not parse.`)
  }
  if (data === null || data === undefined) data = {}
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error(`The front matter of ${name} is not a list of keys and values.`)
  return { data: data as Record<string, unknown>, body: source.slice(m[0].length) }
}
