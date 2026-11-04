/**
 * Writing a run's changes back to the agent's workspace (workflows spec part 2, *Writing back*), once the scan has
 * passed. Each change is applied only where the agent left that path as it was when the run started; a path the agent
 * also changed keeps the agent's version, and the run's copy is written beside it as `<file>.workflow-<run>` and
 * reported as a conflict. A deletion of a path the agent changed is dropped.
 *
 * The workspace is the agent's to write while this runs, so every path is reached through `safeTree.ts` from an open
 * directory, never following a link, and every file is written to a new name in its folder and renamed into place:
 * a rename replaces a link or a second name at the target, never writes through it.
 */
import fs from 'node:fs/promises'
import { constants as C } from 'node:fs'
import { randomBytes } from 'node:crypto'
import type { WorkflowWriteBack } from '@agenthix/core'
import { copyHandle, hashHandle, plainMode, sameEntry, type Manifest, type ManifestEntry } from './manifest'
import type { RunChange } from './seams'
import {
  closeDir, confirmDir, inDir, LinkRefused, lstatIn, openDirPath, openFileIn, openRoot, type Dir, type TreeRoot,
} from './safeTree'

export type WriteBackInput = {
  runId: string
  workspaceDir: TreeRoot
  snapshotDir: string
  start: Manifest
  end: Manifest
  changes: RunChange[]
}

export function conflictName(name: string, runId: string): string {
  return `${name}.workflow-${runId}`
}

export async function writeBack(input: WriteBackInput): Promise<WorkflowWriteBack> {
  const result: WorkflowWriteBack = { changed: [], conflicts: [] }
  const ws = await openRoot(input.workspaceDir)
  const snap = await openRoot(input.snapshotDir)
  try {
    for (const change of input.changes) await applyOne(change, input, ws, snap, result)
  } finally {
    await closeDir(ws)
    await closeDir(snap)
  }
  return result
}

function split(p: string): { parent: string; name: string } {
  const at = p.lastIndexOf('/')
  return at < 0 ? { parent: '', name: p } : { parent: p.slice(0, at), name: p.slice(at + 1) }
}

async function applyOne(change: RunChange, input: WriteBackInput, ws: Dir, snap: Dir, result: WorkflowWriteBack): Promise<void> {
  const { parent: parentRel, name } = split(change.path)
  let parent: Dir | null
  try {
    parent = await openDirPath(ws, parentRel, { create: change.kind !== 'deleted' })
  } catch (err) {
    // The agent put a link or a file where the run has a folder: nothing of the run's can go there.
    if (err instanceof LinkRefused) {
      if (change.kind !== 'deleted') result.conflicts.push({ path: change.path, keptAs: '' })
      return
    }
    throw err
  }
  if (!parent) return
  try {
    const current = await currentEntry(parent, name)
    const agentChanged = !sameEntry(current, input.start.get(change.path))
    if (change.kind === 'deleted') {
      if (agentChanged || !current) return
      if (current.kind === 'dir') {
        await fs.rmdir(inDir(parent, name)).catch((err: NodeJS.ErrnoException) => {
          if (err.code !== 'ENOTEMPTY' && err.code !== 'EEXIST') throw err
        })
      } else {
        await confirmDir(parent)
        await fs.unlink(inDir(parent, name))
      }
      result.changed.push(change.path)
      return
    }
    const wanted = input.end.get(change.path)
    if (!wanted) return
    if (change.kind === 'dir') {
      if (current?.kind === 'dir') return
      if (current) { result.conflicts.push({ path: change.path, keptAs: '' }); return }
      await fs.mkdir(inDir(parent, name), { mode: wanted.kind === 'dir' ? wanted.mode : 0o755 })
      result.changed.push(change.path)
      return
    }
    if (sameEntry(current, wanted)) return
    const target = agentChanged ? conflictName(name, input.runId) : name
    if (current?.kind === 'dir' && !agentChanged) { result.conflicts.push({ path: change.path, keptAs: '' }); return }
    await place(parent, target, change.path, wanted, snap)
    const keptAs = parentRel ? `${parentRel}/${target}` : target
    if (agentChanged) result.conflicts.push({ path: change.path, keptAs })
    else result.changed.push(change.path)
  } finally {
    await closeDir(parent, ws)
  }
}

async function currentEntry(dir: Dir, name: string): Promise<ManifestEntry | undefined> {
  const entry = await lstatIn(dir, name)
  if (!entry) return undefined
  if (entry.isSymbolicLink()) return { kind: 'link', target: await fs.readlink(inDir(dir, name)) }
  if (entry.isDirectory()) return { kind: 'dir', mode: plainMode(entry.mode) }
  if (!entry.isFile()) return { kind: 'link', target: '' }
  const { handle, stat } = await openFileIn(dir, name, { allowHardLinks: true })
  try {
    return { kind: 'file', sha256: await hashHandle(handle), mode: plainMode(stat.mode) }
  } finally {
    await handle.close().catch(() => {})
  }
}

/** Writes the snapshot's entry at `relPath` into `dir` as `name`, through a new name renamed into place. */
async function place(dir: Dir, name: string, relPath: string, wanted: ManifestEntry, snap: Dir): Promise<void> {
  const temp = `.workflow-write-${randomBytes(6).toString('hex')}`
  const tempPath = inDir(dir, temp)
  try {
    if (wanted.kind === 'link') {
      await fs.symlink(wanted.target, tempPath)
    } else {
      const { parent: snapParentRel, name: snapName } = split(relPath)
      const snapParent = await openDirPath(snap, snapParentRel)
      if (!snapParent) throw new Error(`${relPath} is no longer in the run's snapshot.`)
      try {
        const { handle } = await openFileIn(snapParent, snapName, { allowHardLinks: true })
        try {
          const out = await fs.open(tempPath, C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW, 0o600)
          try {
            await copyHandle(handle, out)
            await out.chmod(wanted.kind === 'file' ? wanted.mode : 0o644)
          } finally {
            await out.close()
          }
        } finally {
          await handle.close().catch(() => {})
        }
      } finally {
        await closeDir(snapParent, snap)
      }
    }
    await confirmDir(dir)
    await fs.rename(tempPath, inDir(dir, name))
  } catch (err) {
    await fs.rm(tempPath, { force: true }).catch(() => {})
    throw err
  }
}
