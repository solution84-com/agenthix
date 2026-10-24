/**
 * What a run changed in its snapshot: the end compared with the start, by content. Ordered to be applied as it
 * stands — folders before what is in them, files and links, then deletions deepest first.
 */
import { sameEntry, type Manifest } from './manifest'
import type { RunChange } from './seams'

export function diffManifests(start: Manifest, end: Manifest): RunChange[] {
  const dirs: RunChange[] = []
  const items: RunChange[] = []
  const deleted: RunChange[] = []
  for (const [p, after] of end) {
    const before = start.get(p)
    if (sameEntry(before, after)) continue
    // A path that was something else first is removed, then made again.
    if (before && before.kind !== after.kind) deleted.push({ kind: 'deleted', path: p })
    const created = !before || before.kind !== after.kind
    if (after.kind === 'dir') {
      if (created) dirs.push({ kind: 'dir', path: p })
    } else {
      items.push({ kind: after.kind, path: p, created })
    }
  }
  for (const p of start.keys()) {
    if (!end.has(p)) deleted.push({ kind: 'deleted', path: p })
  }
  const depth = (p: string) => p.split('/').length
  dirs.sort((a, b) => depth(a.path) - depth(b.path) || cmp(a.path, b.path))
  items.sort((a, b) => cmp(a.path, b.path))
  deleted.sort((a, b) => depth(b.path) - depth(a.path) || cmp(a.path, b.path))
  // A kind change replaces a folder with a file (or the other way): its removal must come first.
  const replaced = new Set(deleted.filter(d => end.has(d.path)).map(d => d.path))
  const firstDeletes = deleted.filter(d => replaced.has(d.path) || [...replaced].some(r => d.path.startsWith(`${r}/`)))
  const laterDeletes = deleted.filter(d => !firstDeletes.includes(d))
  return [...firstDeletes, ...dirs, ...items, ...laterDeletes]
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
