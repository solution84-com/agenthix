/** Two versions side by side on the screen: the same shape the server answers for a version against the approved one. */
import { diffLines, diffSettings, type DiffLine, type FileDiff, type VersionDiff } from '../versionDiff'
import type { WorkflowVersionView } from './workflowTypes'

type File = WorkflowVersionView['files'][number]

function fileDiff(path: string, before: File | undefined, after: File | undefined): FileDiff {
  if (!before || !after) {
    const f = (before ?? after)!
    const lines = f.text === null ? null : f.text.split('\n').map((t): DiffLine => ({ kind: before ? 'removed' : 'added', text: t }))
    return { path, change: before ? 'removed' : 'added', lines, binary: f.text === null, modeChanged: false }
  }
  const modeChanged = before.executable !== after.executable
  if (before.text !== null && before.text === after.text) return { path, change: modeChanged ? 'changed' : 'same', lines: null, binary: false, modeChanged }
  const binary = before.text === null || after.text === null
  return { path, change: 'changed', lines: binary ? null : diffLines(before.text!, after.text!), binary, modeChanged }
}

/** What changed from `before` to `after`. */
export function compareVersions(before: WorkflowVersionView, after: WorkflowVersionView): VersionDiff {
  const old = new Map(before.files.map((f) => [f.path, f]))
  const now = new Map(after.files.map((f) => [f.path, f]))
  const paths = [...new Set([...old.keys(), ...now.keys()])].sort()
  return { files: paths.map((p) => fileDiff(p, old.get(p), now.get(p))), settings: diffSettings(before.definition, after.definition) }
}

export type ShownLine = DiffLine | { kind: 'gap'; hidden: number }

/** A changed file's lines with the unchanged ones away from a change folded into a gap, `context` lines kept each side. */
export function withContext(lines: DiffLine[], context = 3): ShownLine[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((l, i) => {
    if (l.kind === 'same') return
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = true
  })
  const out: ShownLine[] = []
  let hidden = 0
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (hidden) { out.push({ kind: 'gap', hidden }); hidden = 0 }
      out.push(l)
    } else hidden++
  })
  if (hidden) out.push({ kind: 'gap', hidden })
  return out
}
