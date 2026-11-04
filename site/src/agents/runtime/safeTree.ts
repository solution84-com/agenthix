/**
 * Walking and changing a tree someone else can write while the site works on it — the agent's workspace, a
 * snapshot a step has changed, or a run's harness home (`homeFolder.ts`) — without ever following a link (workflows
 * spec part 2, *Links are never followed*). The executor uses it
 * through `executor/safeTree.ts`.
 *
 * Every directory is opened with `O_DIRECTORY | O_NOFOLLOW`, one part of the path at a time from an open parent, and
 * every name is looked up in that open directory: on Linux through `/proc/self/fd/<fd>/<name>`, which the kernel
 * resolves through the descriptor itself (the `openat` Node does not expose), so a directory swapped for a link
 * after it was opened changes nothing. macOS, the development platform, has no `/proc`: there each directory's path
 * is its real path and its identity is checked again after it is used (`confirmDir`), as `containedFile.ts` does.
 *
 * A symbolic link is never opened or walked into; a file with a second name (a hard link) is reported so the caller
 * can refuse it, since its other name may be outside the tree.
 */
import fs from 'node:fs/promises'
import { constants as C, type BigIntStats } from 'node:fs'
import path from 'node:path'
import { descriptorPath, DESCRIPTOR_PATHS_PINNED, type FileHandle } from './containedFile'

export class LinkRefused extends Error {
  constructor(readonly relPath: string, readonly linkKind: 'symbolic' | 'hard' | 'not_a_directory') {
    super(linkKind === 'hard'
      ? `${relPath} is a hard link, which a workflow never follows.`
      : linkKind === 'symbolic'
        ? `${relPath} is a symbolic link, which a workflow never follows.`
        : `${relPath} is not a folder.`)
  }
}

export type Dir = { handle: FileHandle; real: string; dev: bigint; ino: bigint; rel: string }

const DIR_FLAGS = C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW

export function isPlainName(name: string): boolean {
  return name.length > 0 && name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\0')
}

/** The path a name inside `dir` is looked up by. */
export function inDir(dir: Dir, name: string): string {
  if (!isPlainName(name)) throw new Error('Not a plain name.')
  return path.join(descriptorPath(dir.handle, dir.real), name)
}

/**
 * A tree's root: a path whose every folder only the site can change, or a folder `rel` below such a `base` (a
 * boundary's own folder), which is then reached through open folders from `base`, never through a link (adr-0173).
 */
export type TreeRoot = string | { base: string; rel: string }

/** Opens a tree's root. A path must not itself be a link; it is resolved to its real path first. */
export async function openRoot(root: TreeRoot): Promise<Dir> {
  if (typeof root !== 'string') {
    const base = await openRoot(root.base)
    try {
      const dir = await openDirPath(base, root.rel)
      if (!dir) throw Object.assign(new Error(`ENOENT: no such folder, '${root.rel}'`), { code: 'ENOENT' })
      return { ...dir, rel: '' }
    } finally {
      await closeDir(base)
    }
  }
  const entry = await fs.lstat(root)
  if (entry.isSymbolicLink()) throw new LinkRefused('.', 'symbolic')
  const real = await fs.realpath(root)
  const handle = await fs.open(real, DIR_FLAGS)
  const st = await handle.stat({ bigint: true })
  return { handle, real, dev: st.dev, ino: st.ino, rel: '' }
}

/** On macOS, that `dir`'s path still names the directory that was opened. A no-op where descriptors pin it. */
export async function confirmDir(dir: Dir): Promise<void> {
  if (DESCRIPTOR_PATHS_PINNED) return
  const now = await fs.lstat(dir.real, { bigint: true }).catch(() => null)
  if (!now || now.isSymbolicLink() || now.dev !== dir.dev || now.ino !== dir.ino) {
    throw new LinkRefused(dir.rel || '.', 'symbolic')
  }
}

function relOf(dir: Dir, name: string): string {
  return dir.rel ? `${dir.rel}/${name}` : name
}

/** The entry `name` in `dir`, not followed; null when there is none. */
export async function lstatIn(dir: Dir, name: string): Promise<BigIntStats | null> {
  try {
    return await fs.lstat(inDir(dir, name), { bigint: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** Opens the directory `name` inside `dir`; null when missing. Refuses a link or anything not a directory. */
export async function openChildDir(dir: Dir, name: string, opts: { create?: boolean; mode?: number } = {}): Promise<Dir | null> {
  const rel = relOf(dir, name)
  if (opts.create) {
    await fs.mkdir(inDir(dir, name), { mode: opts.mode ?? 0o755 }).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'EEXIST') throw err
    })
  }
  let handle: FileHandle
  try {
    handle = await fs.open(inDir(dir, name), DIR_FLAGS)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    if (code === 'ELOOP') throw new LinkRefused(rel, 'symbolic')
    if (code === 'ENOTDIR') {
      const entry = await lstatIn(dir, name)
      throw new LinkRefused(rel, entry?.isSymbolicLink() ? 'symbolic' : 'not_a_directory')
    }
    throw err
  }
  const st = await handle.stat({ bigint: true })
  const child: Dir = { handle, real: path.join(dir.real, name), dev: st.dev, ino: st.ino, rel }
  try {
    await confirmDir(dir)
    await confirmDir(child)
  } catch (err) {
    await handle.close().catch(() => {})
    throw err
  }
  return child
}

/**
 * Opens the directory at `relPath` (parts joined with `/`) under `root`, one part at a time; null when a part is
 * missing and `create` is off. Every directory opened on the way is closed, except the one returned.
 */
export async function openDirPath(root: Dir, relPath: string, opts: { create?: boolean } = {}): Promise<Dir | null> {
  const parts = relPath.split('/').filter(Boolean)
  let current = root
  for (const part of parts) {
    let next: Dir | null
    try {
      next = await openChildDir(current, part, opts)
    } finally {
      if (current !== root) await current.handle.close().catch(() => {})
    }
    if (!next) return null
    current = next
  }
  return current
}

export async function closeDir(dir: Dir, root?: Dir): Promise<void> {
  if (dir !== root) await dir.handle.close().catch(() => {})
}

/**
 * Opens the regular file `name` in `dir` for reading, never following a link at it. Refuses a symbolic link, and a
 * hard link unless `allowHardLinks` (a snapshot's own files, which no one outside the run could have linked).
 */
export async function openFileIn(dir: Dir, name: string, opts: { allowHardLinks?: boolean } = {}): Promise<{ handle: FileHandle; stat: BigIntStats }> {
  const rel = relOf(dir, name)
  let handle: FileHandle
  try {
    handle = await fs.open(inDir(dir, name), C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ELOOP') throw new LinkRefused(rel, 'symbolic')
    throw err
  }
  try {
    const stat = await handle.stat({ bigint: true })
    if (!stat.isFile()) throw Object.assign(new Error(`${rel} is not a file.`), { code: 'EISDIR' })
    if (stat.nlink > 1n && !opts.allowHardLinks) throw new LinkRefused(rel, 'hard')
    await confirmDir(dir)
    if (!DESCRIPTOR_PATHS_PINNED) {
      const now = await lstatIn(dir, name)
      if (!now || now.isSymbolicLink() || now.ino !== stat.ino || now.dev !== stat.dev) throw new LinkRefused(rel, 'symbolic')
    }
    return { handle, stat }
  } catch (err) {
    await handle.close().catch(() => {})
    throw err
  }
}

/** A path that reads the open file itself: pinned on Linux; on macOS its path, which the caller confirms after use. */
export function filePath(dir: Dir, name: string, handle: FileHandle): string {
  return DESCRIPTOR_PATHS_PINNED ? `/proc/self/fd/${handle.fd}` : path.join(dir.real, name)
}

/** The names in `dir`, read through the open directory. */
export async function namesIn(dir: Dir): Promise<string[]> {
  const names = await fs.readdir(descriptorPath(dir.handle, dir.real))
  await confirmDir(dir)
  return names.filter(isPlainName).sort()
}
