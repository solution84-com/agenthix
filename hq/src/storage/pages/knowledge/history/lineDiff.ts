import { parseFrontMatter, type FrontMatterValue } from '@agenthix/core'

export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string }

/** Past this many line pairs the table is not built and the whole text shows as replaced. */
const MAX_CELLS = 250_000
const CONTEXT = 2

/** The lines of `before` and `after` side by side: what stayed, what went (`del`) and what came (`add`). */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.split('\n')
  const b = after === '' ? [] : after.split('\n')
  if (a.length * b.length > MAX_CELLS) {
    return [...a.map((text): DiffLine => ({ kind: 'del', text })), ...b.map((text): DiffLine => ({ kind: 'add', text }))]
  }
  const width = b.length + 1
  const lcs = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] = a[i] === b[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { out.push({ kind: 'same', text: a[i] }); i++; j++ }
    else if (j < b.length && (i === a.length || lcs[i * width + j + 1] > lcs[(i + 1) * width + j])) { out.push({ kind: 'add', text: b[j++] }) }
    else out.push({ kind: 'del', text: a[i++] })
  }
  return out
}

/** The changed lines with a little of what surrounds them; a run of unchanged lines between is `null`. */
export function withContext(lines: DiffLine[]): Array<DiffLine | null> {
  const keep = lines.map((l, i) => l.kind !== 'same' || lines.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1).some(n => n.kind !== 'same'))
  const out: Array<DiffLine | null> = []
  lines.forEach((l, i) => {
    if (keep[i]) out.push(l)
    else if (out[out.length - 1] !== null) out.push(null)
  })
  return out
}

export interface FieldChange { name: string; before?: string; after?: string }

const shown = (v: FrontMatterValue): string => (v.kind === 'text' ? v.text : v.items.join(', '))

function fieldsOf(page: string): { fields: Map<string, string>; body: string } | null {
  const parsed = parseFrontMatter(page)
  if (parsed.problems.length > 0) return null
  return { fields: new Map(parsed.fields.map(f => [f.name, shown(f.value)])), body: parsed.body }
}

/**
 * What a version changed, split into the front matter's fields (title, description, tags and the place's own
 * properties) and the text under it. A page whose front matter cannot be read is compared as plain lines.
 */
export function diffPages(before: string, after: string): { fields: FieldChange[]; lines: DiffLine[] } {
  const a = fieldsOf(before)
  const b = fieldsOf(after)
  if (!a || !b) return { fields: [], lines: diffLines(before, after) }
  const names = [...new Set([...a.fields.keys(), ...b.fields.keys()])]
  const fields = names
    .filter(name => a.fields.get(name) !== b.fields.get(name))
    .map((name): FieldChange => ({ name, before: a.fields.get(name), after: b.fields.get(name) }))
  return { fields, lines: diffLines(a.body, b.body) }
}
