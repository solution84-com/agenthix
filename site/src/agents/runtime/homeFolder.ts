/**
 * The one way the site writes, removes and reads in a run's harness home (harnessHomes.ts).
 *
 * The run writes its whole home, so anything in it may be a link: it can rename `.claude` and put a link or a folder
 * of its own in its place. The harness home itself is the folder the site made and bound at the image user's home
 * directory, which a run cannot replace, so every operation starts from it and goes down one folder at a time
 * through `safeTree.ts`: each folder opened without following a link, each name looked up in the open folder (on
 * Linux through `/proc/self/fd`, so nothing renamed or linked afterwards can redirect it; on macOS, the development
 * platform, by real path, confirmed again after use). A link anywhere on the way is refused with
 * `Forbidden: <label>`, never followed; removals unlink a link itself and never walk into one.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  closeDir,
  confirmDir,
  inDir,
  LinkRefused,
  lstatIn,
  namesIn,
  openChildDir,
  openDirPath,
  openFileIn,
  openRoot,
  type Dir,
} from './safeTree'
import { descriptorPath } from './containedFile'
import { RUN_STAGING_PINNED_MEMORY, RUN_STAGING_SKILLS, type RunStagingFolder } from './runStagingFolders'

export { closeDir, inDir, lstatIn, namesIn, type Dir } from './safeTree'

function forbidden(label: string): Error {
  return new Error(`Forbidden: ${label}`)
}

function missing(what: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`ENOENT: no such folder, '${what}'`), { code: 'ENOENT' })
}

async function refusingLinks<T>(label: string, act: () => Promise<T>): Promise<T> {
  try {
    return await act()
  } catch (err) {
    throw err instanceof LinkRefused ? forbidden(label) : err
  }
}

/**
 * Runs `work` on the folder `relPath` (parts joined with `/`) inside `home`, opened one part at a time and never
 * through a link. Missing folders are made when `create` is set; otherwise a missing one throws `ENOENT`.
 */
export async function withHomeFolder<T>(
  home: string,
  relPath: string,
  label: string,
  work: (dir: Dir) => Promise<T>,
  opts: { create?: boolean } = {},
): Promise<T> {
  if (opts.create) await fs.mkdir(home, { recursive: true })
  const root = await refusingLinks(label, () => openRoot(home))
  try {
    const dir = await refusingLinks(label, () => openDirPath(root, relPath, opts))
    if (!dir) throw missing(relPath)
    try {
      const result = await refusingLinks(label, () => work(dir))
      await refusingLinks(label, () => confirmDir(dir))
      return result
    } finally {
      await closeDir(dir, root)
    }
  } finally {
    await closeDir(root)
  }
}

/** Opens `root` (not itself a link) as the top of a tree only the site writes. */
export async function openTreeRoot(root: string): Promise<Dir> {
  return openRoot(root)
}

/** A path naming the open folder itself, for code that acts on a folder by path (see `descriptorPath`). */
export function folderPath(dir: Dir): string {
  return descriptorPath(dir.handle, dir.real)
}

/** Opens (and makes, when missing) the folder `relPath` inside `dir`; the caller closes it with `closeDir`. */
export async function openFolderIn(dir: Dir, relPath: string): Promise<Dir> {
  const opened = await openDirPath(dir, relPath, { create: true })
  if (!opened) throw missing(relPath)
  return opened
}

/**
 * Writes `name` in `dir` whole: a temp file made fresh (`wx`, so nothing planted under its name is followed), then
 * renamed over the name, which replaces a link there rather than writing through it.
 */
export async function writeFileAtomicInDir(dir: Dir, name: string, contents: string | Buffer, mode = 0o600): Promise<void> {
  const tmp = `.${name}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  try {
    await fs.writeFile(inDir(dir, tmp), contents, { mode, flag: 'wx' })
    await fs.rename(inDir(dir, tmp), inDir(dir, name))
  } catch (err) {
    await fs.unlink(inDir(dir, tmp)).catch(() => {})
    throw err
  }
  await confirmDir(dir)
}

/** Writes a new file at `relFile` under `dir`, making its folders; refuses if anything is already there. */
export async function writeNewFileUnder(dir: Dir, relFile: string, contents: string | Buffer, mode = 0o644): Promise<void> {
  const parts = relFile.split('/').filter(Boolean)
  const name = parts.pop()
  if (!name) throw new Error('Not a file name.')
  const parent = parts.length ? await openFolderIn(dir, parts.join('/')) : dir
  try {
    await fs.writeFile(inDir(parent, name), contents, { mode, flag: 'wx' })
    await confirmDir(parent)
  } finally {
    await closeDir(parent, dir)
  }
}

/** Reads the regular file at `relFile` under `dir`, never through a link. */
export async function readFileUnder(dir: Dir, relFile: string): Promise<Buffer> {
  const parts = relFile.split('/').filter(Boolean)
  const name = parts.pop()
  if (!name) throw new Error('Not a file name.')
  const parent = parts.length ? await openDirPath(dir, parts.join('/')) : dir
  if (!parent) throw missing(relFile)
  try {
    const { handle } = await openFileIn(parent, name)
    try {
      return await handle.readFile()
    } finally {
      await handle.close().catch(() => {})
    }
  } finally {
    await closeDir(parent, dir)
  }
}

const ignoreMissing = (err: unknown): void => {
  if ((err as NodeJS.ErrnoException | null)?.code !== 'ENOENT') throw err
}

/**
 * Removes the entry `name` in `dir` and everything under it. A link is unlinked itself; a folder is emptied through
 * its own open descriptor, so nothing swapped in during the removal leads it anywhere else. Absent is success.
 */
export async function removeEntryIn(dir: Dir, name: string): Promise<void> {
  const entry = await lstatIn(dir, name)
  if (!entry) return
  if (entry.isDirectory()) {
    let child: Dir | null = null
    try {
      child = await openChildDir(dir, name)
    } catch (err) {
      if (!(err instanceof LinkRefused)) throw err
    }
    if (child) {
      try {
        for (const inner of await namesIn(child)) await removeEntryIn(child, inner)
      } finally {
        await closeDir(child)
      }
      await confirmDir(dir)
      await fs.rmdir(inDir(dir, name)).catch(ignoreMissing)
      return
    }
  }
  await confirmDir(dir)
  await fs.unlink(inDir(dir, name)).catch(ignoreMissing)
}

/** The harness home a Claude folder (`<home>/.claude`, as the site sees it) sits in. */
export function harnessHomeOfClaudeFolder(claudeHome: string): string {
  return path.dirname(path.resolve(claudeHome))
}

/**
 * Runs `work` on one folder of a runner's run staging (`runStagingFolders.ts`), made when `create` is set. Run
 * staging is outside every folder a container can write, so nothing in it can have been replaced; it is opened the
 * same way as a home only so the staging code has one way to work.
 */
export async function withRunStaging<T>(
  runStaging: string, folder: RunStagingFolder, work: (dir: Dir) => Promise<T>, opts: { create?: boolean } = {},
): Promise<T> {
  return withHomeFolder(runStaging, folder, 'run staging is not a folder of its own', work, opts)
}

/**
 * Removes `<run staging>/<skills|pinned-memory>/<name>`, named by its full path as the site sees it. Absent is
 * success; a path that is not one entry of a run staging folder is refused.
 */
export async function removeFromRunStaging(entryPath: string): Promise<void> {
  const folder = path.dirname(path.resolve(entryPath))
  const kind = path.basename(folder)
  if (kind !== RUN_STAGING_SKILLS && kind !== RUN_STAGING_PINNED_MEMORY) {
    throw new Error('Refusing to remove something outside run staging')
  }
  try {
    await withRunStaging(path.dirname(folder), kind, dir => removeEntryIn(dir, path.basename(entryPath)))
  } catch (err) {
    ignoreMissing(err)
  }
}

/**
 * Makes `home/<relative>` a chain of real folders, before a container mounts anything there (Docker would otherwise
 * make a missing mount point root-owned). Whatever else stands at one of its parts — a symbolic link, a file — is
 * removed, never followed, and each folder is made and opened from the one above it: another container of the same
 * runner shares the home, and may change it while this runs.
 */
export async function ensureRealFolders(home: string, relative: string): Promise<void> {
  await fs.mkdir(home, { recursive: true })
  let current = await openRoot(home)
  try {
    for (const part of relative.split('/').filter(Boolean)) {
      const entry = await lstatIn(current, part)
      if (entry && !entry.isDirectory()) await removeEntryIn(current, part)
      const next = await openChildDir(current, part, { create: true })
      if (!next) throw missing(part)
      await closeDir(current)
      current = next
    }
  } finally {
    await closeDir(current)
  }
}

/**
 * Makes each of `relatives` under `root` where missing, one folder at a time from `root`, which must itself be a
 * folder no container can replace (a boundary's own folder, a home). A part that is a link, or not a folder, is left
 * as it is and that folder is not made: a run put it there, and nothing outside a container follows it (adr-0173).
 */
export async function ensureFoldersUnder(root: string, relatives: readonly string[]): Promise<void> {
  await fs.mkdir(root, { recursive: true })
  const top = await openRoot(root)
  try {
    for (const rel of relatives) {
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue
      try {
        const dir = await openDirPath(top, rel.split(path.sep).join('/'), { create: true })
        if (dir) await closeDir(dir, top)
      } catch (err) {
        if (!(err instanceof LinkRefused)) throw err
      }
    }
  } finally {
    await closeDir(top)
  }
}
