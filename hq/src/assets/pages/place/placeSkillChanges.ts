import type { FileChange } from '@agenthix/ui/files'

export type PlaceFile = { path: string; base64: string }

export type SkillFiles = {
  fingerprint: string
  current: boolean
  files: PlaceFile[]
  newestVersion: number | null
  changes: { added: string[]; changed: string[]; removed: string[] }
  /** The newest version's text of each file changed or removed since. */
  before: PlaceFile[]
}

/** A file's text, or null when it is not UTF-8 (a binary file has no lines to compare). */
export function textOf(base64: string): string | null {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** What changed since the newest published version, file by file, for the one diff renderer. */
export function placeSkillChanges(data: SkillFiles): FileChange[] {
  const now = new Map(data.files.map(f => [f.path, f.base64]))
  const then = new Map(data.before.map(f => [f.path, f.base64]))
  const change = (path: string, status: FileChange['status']): FileChange => {
    const b = then.get(path)
    const a = now.get(path)
    const before = b === undefined ? null : textOf(b)
    const after = a === undefined ? null : textOf(a)
    const binary = (b !== undefined && before === null) || (a !== undefined && after === null)
    return { path, status, before: binary ? null : before, after: binary ? null : after, binary }
  }
  return [
    ...data.changes.added.map(p => change(p, 'added')),
    ...data.changes.changed.map(p => change(p, 'modified')),
    ...data.changes.removed.map(p => change(p, 'removed')),
  ].sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0))
}
