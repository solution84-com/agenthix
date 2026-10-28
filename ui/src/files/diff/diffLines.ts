export type DiffLineKind = 'same' | 'add' | 'del'

export interface DiffLine {
  kind: DiffLineKind
  text: string
  /** The line's number in the old text; null for an added line. */
  oldNo: number | null
  /** The line's number in the new text; null for a removed line. */
  newNo: number | null
}

/** Past this many cells a middle section is not compared line by line: it is shown as removed, then added. */
const MAX_CELLS = 4_000_000

const split = (text: string): string[] => {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** The lines of two texts compared as a git diff reads: common lines, removed lines and added lines, in order. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = split(before)
  const b = split(after)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }

  const out: DiffLine[] = []
  for (let i = 0; i < start; i++) out.push({ kind: 'same', text: a[i], oldNo: i + 1, newNo: i + 1 })

  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  for (const step of compare(midA, midB)) {
    if (step.kind === 'same') out.push({ kind: 'same', text: step.text, oldNo: start + step.i + 1, newNo: start + step.j + 1 })
    else if (step.kind === 'del') out.push({ kind: 'del', text: step.text, oldNo: start + step.i + 1, newNo: null })
    else out.push({ kind: 'add', text: step.text, oldNo: null, newNo: start + step.j + 1 })
  }

  for (let k = 0; k < a.length - endA; k++) {
    out.push({ kind: 'same', text: a[endA + k], oldNo: endA + k + 1, newNo: endB + k + 1 })
  }
  return out
}

interface Step { kind: DiffLineKind; text: string; i: number; j: number }

function compare(a: string[], b: string[]): Step[] {
  const steps: Step[] = []
  if (a.length === 0 || b.length === 0 || a.length * b.length > MAX_CELLS) {
    a.forEach((text, i) => steps.push({ kind: 'del', text, i, j: 0 }))
    b.forEach((text, j) => steps.push({ kind: 'add', text, i: 0, j }))
    return steps
  }
  // Longest common subsequence of the lines, by the table of suffix lengths.
  const w = b.length + 1
  const table = new Uint32Array((a.length + 1) * w)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * w + j] = a[i] === b[j] ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1])
    }
  }
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { steps.push({ kind: 'same', text: a[i], i, j }); i++; j++ }
    else if (j < b.length && (i === a.length || table[i * w + j + 1] > table[(i + 1) * w + j])) { steps.push({ kind: 'add', text: b[j], i, j }); j++ }
    else { steps.push({ kind: 'del', text: a[i], i, j }); i++ }
  }
  return steps
}

export interface DiffStats { added: number; removed: number }

export function diffStats(lines: readonly DiffLine[]): DiffStats {
  let added = 0
  let removed = 0
  for (const l of lines) { if (l.kind === 'add') added++; else if (l.kind === 'del') removed++ }
  return { added, removed }
}

export type DiffRow = DiffLine | { kind: 'gap'; hidden: number }

/** The lines to show: every change with `context` unchanged lines around it, and a gap row where lines are left out. */
export function withContext(lines: readonly DiffLine[], context = 3): DiffRow[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((l, i) => {
    if (l.kind === 'same') return
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true
  })
  const rows: DiffRow[] = []
  let hidden = 0
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (hidden) { rows.push({ kind: 'gap', hidden }); hidden = 0 }
      rows.push(l)
    } else hidden++
  })
  if (hidden) rows.push({ kind: 'gap', hidden })
  return rows
}
