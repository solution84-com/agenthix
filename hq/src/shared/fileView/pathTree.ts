import { diffLines } from '@agenthix/ui/files'

/** A folder of a flat file list, as a tree draws it: folders first, then files, each by name. */
export type TreeFolder = { path: string; name: string; folders: TreeFolder[]; files: string[] }

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
export const baseName = (path: string) => path.split('/').pop() ?? path
export const parentOf = (path: string) => path.split('/').slice(0, -1).join('/')

/** The folders and files of `paths`, from the top ('' its path). */
export function pathTree(paths: readonly string[]): TreeFolder {
  const top: TreeFolder = { path: '', name: '', folders: [], files: [] }
  for (const path of paths) {
    const parts = path.split('/')
    let at = top
    for (let i = 0; i < parts.length - 1; i++) {
      const folder = parts.slice(0, i + 1).join('/')
      let next = at.folders.find(f => f.path === folder)
      if (!next) { next = { path: folder, name: parts[i]!, folders: [], files: [] }; at.folders.push(next) }
      at = next
    }
    if (!at.files.includes(path)) at.files.push(path)
  }
  const sort = (f: TreeFolder) => {
    f.folders.sort((a, b) => byName(a.name, b.name)).forEach(sort)
    f.files.sort((a, b) => byName(baseName(a), baseName(b)))
  }
  sort(top)
  return top
}

/** Every file of the tree in the order it lists them: for stepping from one file to the next. */
export function treeFiles(folder: TreeFolder): string[] {
  return [...folder.folders.flatMap(treeFiles), ...folder.files]
}

/** Every folder holding one of `paths`, at any depth, '' left out: the folders a tree marks with a dot. */
export function foldersOf(paths: Iterable<string>): Set<string> {
  const out = new Set<string>()
  for (const p of paths) {
    const parts = p.split('/')
    for (let i = 1; i < parts.length; i++) out.add(parts.slice(0, i).join('/'))
  }
  return out
}

export type LineMarkKind = 'added' | 'changed'

/**
 * The lines of `after` that differ from `before`, by their number in `after`: added where a run adds lines only,
 * changed where it also takes lines away. A run that only takes lines away marks the line after it as changed.
 */
export function changedLines(before: string, after: string): { line: number; kind: LineMarkKind }[] {
  const rows = diffLines(before, after)
  const out: { line: number; kind: LineMarkKind }[] = []
  let i = 0
  while (i < rows.length) {
    if (rows[i]!.kind === 'same') { i++; continue }
    let j = i
    let removed = false
    const added: number[] = []
    while (j < rows.length && rows[j]!.kind !== 'same') {
      const r = rows[j]!
      if (r.kind === 'del') removed = true
      else if (r.newNo !== null) added.push(r.newNo)
      j++
    }
    if (added.length) for (const line of added) out.push({ line, kind: removed ? 'changed' : 'added' })
    else if (j < rows.length && rows[j]!.newNo !== null) out.push({ line: rows[j]!.newNo!, kind: 'changed' })
    i = j
  }
  return out
}
