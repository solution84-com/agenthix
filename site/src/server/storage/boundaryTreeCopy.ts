/**
 * Moving a folder's files between a boundary's folder, which containers write, and a folder only the site writes
 * (adr-0173). Both ways go through open folders (`safeTree.ts`), from the boundary's own folder down: a folder is
 * opened without following a symbolic link (symlink) and every name is looked up in the open folder, so a symlink a
 * container put on the way, or swaps in while the copy runs, leads nowhere outside.
 *
 * - **Out of a boundary** (`copyOutOfBoundary`): a workspace that becomes a repository, or `files/` backed up to
 *   GitHub, is copied into the site's own folder first. A symlink is copied as a symlink and never followed, except
 *   inside `.git`, where git would follow it on this machine: a symlink there refuses the copy. A file's bytes are
 *   read from the descriptor that was checked. Anything that is not a folder, a file or a symlink is left out.
 * - **Into a boundary** (`copyIntoBoundaryFolder`): the finished `.git` of a backup, or a pulled repository, is
 *   written into an open folder of the boundary, each folder made and opened there and each file made new.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  closeDir, inDir, LinkRefused, lstatIn, namesIn, openChildDir, openDirPath, openFileIn, openRoot, type Dir,
} from '../../agents/runtime/safeTree'

export class CopyRefused extends Error {}

const GIT_DIR = '.git'

/**
 * Copies the folder `rel` under the boundary's folder `boundary` into `dest`, a folder of the site's own that must not
 * exist yet. A folder that is not there copies as an empty one. Throws `CopyRefused` for a symlink on the way to
 * `rel` or inside a `.git`.
 */
export async function copyOutOfBoundary(boundary: string, rel: string, dest: string): Promise<void> {
  const top = await openRoot(boundary).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return null
    throw err
  })
  if (!top) {
    await fs.mkdir(dest, { mode: 0o755 })
    return
  }
  try {
    let from: Dir | null
    try {
      from = await openDirPath(top, rel)
    } catch (err) {
      if (err instanceof LinkRefused) throw new CopyRefused(`the folder ${rel} is not a folder of its own`)
      throw err
    }
    await fs.mkdir(dest, { mode: 0o755 })
    if (!from) return
    try {
      await copyDirOut(from, dest, 'top')
    } finally {
      await closeDir(from, top)
    }
  } finally {
    await closeDir(top)
  }
}

async function copyDirOut(from: Dir, dest: string, where: 'top' | 'below' | 'git'): Promise<void> {
  const inGit = where === 'git'
  for (const name of await namesIn(from)) {
    const entry = await lstatIn(from, name)
    if (!entry) continue
    const to = path.join(dest, name)
    if (entry.isSymbolicLink()) {
      if (inGit) throw new CopyRefused(`a symbolic link inside ${GIT_DIR} (${from.rel}/${name})`)
      await fs.symlink(await fs.readlink(inDir(from, name)), to)
    } else if (entry.isDirectory()) {
      const child = await openChildDir(from, name).catch(err => {
        if (err instanceof LinkRefused) throw new CopyRefused(`${from.rel}/${name} changed while it was copied`)
        throw err
      })
      if (!child) continue
      try {
        await fs.mkdir(to, { mode: 0o755 })
        await copyDirOut(child, to, inGit || (where === 'top' && name === GIT_DIR) ? 'git' : 'below')
      } finally {
        await closeDir(child)
      }
    } else if (entry.isFile()) {
      const { handle, stat } = await openFileIn(from, name, { allowHardLinks: true }).catch(err => {
        if (err instanceof LinkRefused) throw new CopyRefused(`${from.rel}/${name} changed while it was copied`)
        throw err
      })
      try {
        await fs.writeFile(to, await handle.readFile(), { flag: 'wx', mode: Number(stat.mode) & 0o755 | 0o600 })
      } finally {
        await handle.close().catch(() => {})
      }
    }
  }
}

/**
 * Writes the site's own folder `src` as the new entry `name` of the open boundary folder `into`: folders made and
 * opened in it, files made new (`wx`), symlinks made as symlinks. An entry already there under `name` refuses.
 */
export async function copyIntoBoundaryFolder(src: string, into: Dir, name: string): Promise<void> {
  await fs.mkdir(inDir(into, name), { mode: 0o755 })
  const dir = await openChildDir(into, name)
  if (!dir) throw new CopyRefused(`${name} went away while it was written`)
  try {
    await copyDirIn(src, dir)
  } finally {
    await closeDir(dir)
  }
}

/** Writes every entry of the site's own folder `src` into the open boundary folder `into`, each made new there. */
export async function copyEntriesInto(src: string, into: Dir): Promise<void> {
  return copyDirIn(src, into)
}

async function copyDirIn(src: string, into: Dir): Promise<void> {
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    if (entry.isSymbolicLink()) {
      await fs.symlink(await fs.readlink(from), inDir(into, entry.name))
    } else if (entry.isDirectory()) {
      await copyIntoBoundaryFolder(from, into, entry.name)
    } else if (entry.isFile()) {
      const stat = await fs.stat(from)
      await fs.writeFile(inDir(into, entry.name), await fs.readFile(from), { flag: 'wx', mode: stat.mode & 0o777 })
    }
  }
}

/** The names in the folder `rel` of the boundary, through open folders; null when it is not there. */
export async function namesInBoundaryFolder(boundary: string, rel: string): Promise<string[] | null> {
  const top = await openRoot(boundary).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return null
    throw err
  })
  if (!top) return null
  try {
    let dir: Dir | null
    try {
      dir = await openDirPath(top, rel)
    } catch (err) {
      if (err instanceof LinkRefused) throw new CopyRefused(`the folder ${rel} is not a folder of its own`)
      throw err
    }
    if (!dir) return null
    try {
      return await namesIn(dir)
    } finally {
      await closeDir(dir, top)
    }
  } finally {
    await closeDir(top)
  }
}

/** Runs `work` on the boundary folder `rel`, opened through open folders from the boundary's own (made if missing). */
export async function withBoundaryFolder<T>(boundary: string, rel: string, work: (dir: Dir) => Promise<T>): Promise<T> {
  await fs.mkdir(boundary, { recursive: true })
  const top = await openRoot(boundary)
  try {
    let dir: Dir | null
    try {
      dir = await openDirPath(top, rel, { create: true })
    } catch (err) {
      if (err instanceof LinkRefused) throw new CopyRefused(`the folder ${rel} is not a folder of its own`)
      throw err
    }
    if (!dir) throw new CopyRefused(`the folder ${rel} could not be made`)
    try {
      return await work(dir)
    } finally {
      await closeDir(dir, top)
    }
  } finally {
    await closeDir(top)
  }
}
