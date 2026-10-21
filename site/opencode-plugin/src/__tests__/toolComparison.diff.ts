/**
 * How the tool comparison (toolComparison.container.test.ts) tells two runs of
 * one case apart, and how it shows a difference.
 */

export interface Run {
  calls: { tool: string; status: string; output?: string; error?: string; attachments?: { mime: string; url: string }[] }[]
  /** What snapshot.mjs saw in the case's folder afterwards, by relative path. */
  files: Record<string, string>
  /** Where this side's copy of the skill lives, which the skill's output names. */
  skillsRoot: string
}

export interface Difference {
  case: string
  /** The call's position in the case, from 0; -1 for the files left behind. */
  call: number
  tool: string
  field: 'calls' | 'status' | 'output' | 'error' | 'attachments' | 'files'
  /** For files, the path; otherwise empty. */
  path: string
  ours: string
  theirs: string
}

/**
 * Only what the fixture itself makes different is evened out: each side's
 * skill lives in its own folder, and OpenCode lists a skill's files in the
 * order ripgrep walks them, which is not stable.
 */
function normalize(run: Run, text: string | undefined): string {
  if (text === undefined) return ''
  const named = text.split(run.skillsRoot).join('<skills>')
  return named.replace(/<skill_files>\n([\s\S]*?)\n<\/skill_files>/, (_, list: string) =>
    `<skill_files>\n${list.split('\n').sort().join('\n')}\n</skill_files>`)
}

const attachments = (call: Run['calls'][number]) =>
  (call.attachments ?? []).map(a => `${a.mime} ${a.url}`).join('\n')

export function compareRuns(name: string, ours: Run, theirs: Run): Difference[] {
  const out: Difference[] = []
  const add = (d: Omit<Difference, 'case'>) => out.push({ case: name, ...d })
  if (ours.calls.length !== theirs.calls.length) {
    add({ call: -1, tool: '', field: 'calls', path: '', ours: ours.calls.map(c => c.tool).join(','), theirs: theirs.calls.map(c => c.tool).join(',') })
  }
  for (let i = 0; i < Math.min(ours.calls.length, theirs.calls.length); i++) {
    const [a, b] = [ours.calls[i], theirs.calls[i]]
    const pairs = [
      ['status', a.status, b.status],
      ['output', normalize(ours, a.output), normalize(theirs, b.output)],
      ['error', normalize(ours, a.error), normalize(theirs, b.error)],
      ['attachments', attachments(a), attachments(b)],
    ] as const
    for (const [field, x, y] of pairs) if (x !== y) add({ call: i, tool: a.tool, field, path: '', ours: x, theirs: y })
  }
  for (const p of [...new Set([...Object.keys(ours.files), ...Object.keys(theirs.files)])].sort()) {
    const [x, y] = [ours.files[p] ?? '(absent)', theirs.files[p] ?? '(absent)']
    if (x !== y) add({ call: -1, tool: '', field: 'files', path: p, ours: x, theirs: y })
  }
  return out
}

const clip = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}… (${s.length} characters)` : s)

/** The first line where the two texts part, with a line either side. */
export function formatDifference(d: Difference): string {
  const head = d.field === 'files' ? `${d.case}: file ${d.path}` : `${d.case}: call ${d.call} (${d.tool}) ${d.field}`
  const a = d.ours.split('\n')
  const b = d.theirs.split('\n')
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const around = (lines: string[]) => lines.slice(Math.max(0, i - 1), i + 2).map(l => `      ${clip(JSON.stringify(l))}`).join('\n')
  return [
    `${head} — first differs at line ${i + 1} (ours ${a.length} lines, theirs ${b.length})`,
    `    ours:\n${around(a)}`,
    `    theirs:\n${around(b)}`,
  ].join('\n')
}
