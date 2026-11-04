/**
 * The run's snapshot of its workspace (workflows spec part 2, *Nothing changes under a run*): a copy every step works
 * on, bound at the agent's path, which the agent's container can't see or change until the run ends.
 *
 * Copy-on-write where the disk allows it — a clone on APFS, a reflink on Btrfs or XFS — and a byte copy elsewhere.
 * The live workspace is the agent's to write while the copy is made, so it is walked with `safeTree.ts`: a symbolic
 * link is copied as a link and never followed, and a file with a second name (a hard link, whose other name may be
 * outside the workspace) refuses the run. Each file is copied from the descriptor that was checked, never by its path
 * again, except for a clone on macOS, which is checked once more after it is made.
 *
 * The manifest it returns is of the copy, as the run starts: write-back compares both the snapshot at the end and the
 * agent's workspace against it.
 */
import fs from 'node:fs/promises'
import { constants as C } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DESCRIPTOR_PATHS_PINNED } from '../agents/runtime/containedFile'
import { copyHandle, hashHandle, plainMode, type Manifest } from './manifest'
import {
  closeDir, filePath, inDir, LinkRefused, lstatIn, namesIn, openChildDir, openFileIn, openRoot, type Dir, type TreeRoot,
} from './safeTree'

export type SnapshotKind = 'CLONE' | 'COPY'
export type Snapshot = { kind: SnapshotKind; manifest: Manifest }

type CopyMode = { mode: 'probe' | 'clone' | 'copy' }

/** Copies the workspace at `source` to `dest`, which must not exist yet. */
export async function takeSnapshot(source: TreeRoot, dest: string): Promise<Snapshot> {
  const manifest: Manifest = new Map()
  const how: CopyMode = { mode: 'probe' }
  const top = await openRoot(source)
  try {
    const rootStat = await top.handle.stat()
    await fs.mkdir(dest, { mode: plainMode(rootStat.mode) | 0o700 })
    await copyDir(top, dest, manifest, how)
  } finally {
    await closeDir(top)
  }
  return { kind: how.mode === 'clone' ? 'CLONE' : 'COPY', manifest }
}

async function copyDir(dir: Dir, dest: string, manifest: Manifest, how: CopyMode): Promise<void> {
  for (const name of await namesIn(dir)) {
    const rel = dir.rel ? `${dir.rel}/${name}` : name
    const to = path.join(dest, name)
    const entry = await lstatIn(dir, name)
    if (!entry) continue
    if (entry.isSymbolicLink()) {
      const target = await fs.readlink(inDir(dir, name))
      await fs.symlink(target, to)
      manifest.set(rel, { kind: 'link', target })
    } else if (entry.isDirectory()) {
      const child = await openChildDir(dir, name)
      if (!child) continue
      try {
        const mode = plainMode(entry.mode)
        await fs.mkdir(to, { mode: 0o700 })
        await copyDir(child, to, manifest, how)
        await fs.chmod(to, mode)
        manifest.set(rel, { kind: 'dir', mode })
      } finally {
        await closeDir(child)
      }
    } else if (entry.isFile()) {
      if (entry.nlink > 1n) throw new LinkRefused(rel, 'hard')
      await copyFile(dir, name, to, how)
      const copy = await fs.open(to, C.O_RDONLY | C.O_NOFOLLOW)
      try {
        const mode = plainMode(entry.mode)
        await copy.chmod(mode)
        manifest.set(rel, { kind: 'file', sha256: await hashHandle(copy), mode })
      } finally {
        await copy.close()
      }
    }
  }
}

const run = promisify(execFile)

/**
 * A copy-on-write clone, or a throw. Linux: Node's forced clone (the FICLONE ioctl, Btrfs and XFS). macOS: Node can't
 * force one, so the first file is cloned with `cp -c` (APFS's clonefile), and once that has worked the rest go
 * through Node's clone-where-possible copy, which on APFS clones.
 */
async function cloneFile(from: string, to: string, how: CopyMode): Promise<void> {
  if (os.platform() !== 'darwin') return fs.copyFile(from, to, C.COPYFILE_FICLONE_FORCE | C.COPYFILE_EXCL)
  if (how.mode === 'probe') {
    await run('cp', ['-c', '-n', from, to])
    return
  }
  return fs.copyFile(from, to, C.COPYFILE_FICLONE | C.COPYFILE_EXCL)
}

async function copyFile(dir: Dir, name: string, to: string, how: CopyMode): Promise<void> {
  const { handle, stat } = await openFileIn(dir, name)
  try {
    if (how.mode !== 'copy') {
      try {
        await cloneFile(filePath(dir, name, handle), to, how)
        if (!DESCRIPTOR_PATHS_PINNED) {
          // The clone was made by path: it must still be the file that was checked.
          const now = await lstatIn(dir, name)
          if (!now || now.isSymbolicLink() || now.ino !== stat.ino || now.dev !== stat.dev) {
            throw new LinkRefused(dir.rel ? `${dir.rel}/${name}` : name, 'symbolic')
          }
        }
        how.mode = 'clone'
        return
      } catch (err) {
        if (err instanceof LinkRefused) throw err
        await fs.rm(to, { force: true })
        // A disk that can't clone is copied from here on; one clone that fails among others is copied alone.
        if (how.mode === 'probe') how.mode = 'copy'
      }
    }
    const out = await fs.open(to, C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW, 0o600)
    try {
      await copyHandle(handle, out)
    } finally {
      await out.close()
    }
  } finally {
    await handle.close().catch(() => {})
  }
}
