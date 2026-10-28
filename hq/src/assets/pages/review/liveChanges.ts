/**
 * The reviewer's edits laid over a proposal (board R1, "Edit, then accept"): the difference from what is in use as it
 * will be accepted, and the files to send. Client-safe and pure.
 */
import type { FileChange } from '@agenthix/ui/files'
import type { ReviewChange, ReviewFile } from './changes'

export type Edits = Record<string, string>

export function liveChanges(changes: readonly ReviewChange[], files: readonly ReviewFile[], edits: Edits): FileChange[] {
  const byPath = new Map(changes.map(c => [c.path, c]))
  const out: FileChange[] = []
  for (const file of files) {
    const change = byPath.get(file.path)
    if (file.text === null) {
      if (change) out.push({ path: file.path, status: change.status, before: null, after: null, binary: true })
      continue
    }
    const hadBefore = change ? change.status !== 'added' : true
    // Where the proposal changed nothing, what is in use is what it proposes.
    const before = !hadBefore ? null : change ? change.before : file.text
    const after = edits[file.path] ?? file.text
    if (hadBefore && before === after) continue
    out.push({ path: file.path, status: hadBefore ? 'modified' : 'added', before, after })
  }
  const proposed = new Set(files.map(f => f.path))
  for (const c of changes) {
    if (c.status === 'removed' && !proposed.has(c.path)) out.push({ path: c.path, status: 'removed', before: c.before, after: null, binary: c.binary })
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/** Every proposed file, edited or not, as the accepting operation takes them: the text edited, the bytes otherwise. */
export function filesToSend(files: readonly ReviewFile[], edits: Edits): { path: string; text?: string; base64?: string }[] {
  return files.map(f => (f.path in edits && f.text !== null ? { path: f.path, text: edits[f.path]! } : { path: f.path, base64: f.base64 }))
}

export const isEdited = (files: readonly ReviewFile[], edits: Edits): boolean => files.some(f => f.text !== null && f.path in edits && edits[f.path] !== f.text)
