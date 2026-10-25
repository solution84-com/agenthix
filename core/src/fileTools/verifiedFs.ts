/**
 * Opening a file the gate checked, and only that file (spec, "Per-call
 * authorization gate" item 6).
 *
 * The site judges a file tool's path on its real path, resolved in the
 * container, and hands the checked real path back as the call's argument. The
 * tool then opens it — and a command the agent runs could have swapped the
 * path, or a folder on it, for a symbolic link in between, leading the open
 * into the harness home or `/proc`. So these helpers open first and check what
 * was opened: the path the kernel reports for the open descriptor
 * (`/proc/self/fd/<n>`) must be exactly the path that was checked. A link at
 * the end is never followed (`O_NOFOLLOW`); a link anywhere before it makes the
 * reported path differ. Files are then read and written through that
 * descriptor, and a missing folder is created inside the folder descriptor
 * already checked, so nothing is looked up by path twice.
 *
 * Whatever the site allowed, these never open anything in `/proc`, and never
 * open for writing anything in the harness home.
 *
 * Node-only. The types it exports name nothing of Node's, so the package's
 * declarations check without Node's type declarations.
 */
import fs from 'node:fs'
import path from 'node:path'

const { O_RDONLY, O_RDWR, O_CREAT, O_EXCL, O_NOFOLLOW, O_NONBLOCK, O_DIRECTORY } = fs.constants

export const HARNESS_HOME = '/home/appuser'
const NEVER_OPENED = ['/proc']
const NEVER_WRITTEN = [...NEVER_OPENED, HARNESS_HOME]

/** How the kernel names an open descriptor, and a name inside an open folder. Linux: `/proc/self/fd`. */
export type FdPaths = {
  open(p: string, flags: number, mode?: number): number
  pathOf(fd: number): string
  child(dirFd: number, name: string): string
}

export const procFdPaths: FdPaths = {
  open: (p, flags, mode) => fs.openSync(p, flags, mode),
  pathOf: fd => fs.readlinkSync(`/proc/self/fd/${fd}`),
  child: (dirFd, name) => `/proc/self/fd/${dirFd}/${name}`,
}

/** The checked file is no longer at its path, or its path now leads somewhere else. */
export class PathChangedError extends Error {
  constructor(readonly filePath: string) {
    super(`${filePath} changed after it was checked, so it was not opened. Try again.`)
  }
}

export class NotFoundError extends Error {
  constructor(readonly filePath: string) {
    super(`File not found: ${filePath}`)
  }
}

const under = (p: string, roots: string[]) => roots.some(r => p === r || p.startsWith(r + '/'))

function closeQuietly(fd: number): void {
  try { fs.closeSync(fd) } catch { /* already closed */ }
}

function errno(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code
}

/**
 * ENOTDIR from opening `entry` as a folder without following a link (Linux's
 * answer for a link there): a link means the path is not what was checked; a
 * file, or a file on the way to it, is simply not a folder, and the caller
 * reports that failure as it is. `entry` is only looked at, never opened.
 */
function notAFolder(entry: string, checked: string, err: unknown): unknown {
  try {
    if (!fs.lstatSync(entry).isSymbolicLink()) return err
  } catch (e) {
    if (errno(e) === 'ENOTDIR') return err
  }
  return new PathChangedError(checked)
}

/** Refuses a descriptor that is not at `expected`, closing it. */
function verify(sys: FdPaths, fd: number, expected: string, forbidden: string[]): number {
  let actual: string
  try {
    actual = sys.pathOf(fd)
  } catch {
    closeQuietly(fd)
    throw new PathChangedError(expected)
  }
  if (actual !== expected || under(actual, forbidden)) {
    closeQuietly(fd)
    throw new PathChangedError(expected)
  }
  return fd
}

function openChecked(sys: FdPaths, p: string, flags: number, forbidden: string[], mode?: number): number {
  if (under(p, forbidden)) throw new PathChangedError(p)
  let fd: number
  try {
    fd = sys.open(p, flags | O_NOFOLLOW, mode)
  } catch (err) {
    if (errno(err) === 'ENOENT') throw new NotFoundError(p)
    if (errno(err) === 'ELOOP') throw new PathChangedError(p)
    throw err
  }
  return verify(sys, fd, p, forbidden)
}

/** What these helpers say of a file: the part of `fs.Stats` the tools use. */
export type FileStat = {
  size: number
  mtimeMs: number
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

/** One entry of a folder: the part of `fs.Dirent` the tools use. */
export type FolderEntry = {
  name: string
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

export type Opened = { fd: number; stat: FileStat }

/** A file or folder to read, opened at exactly `p`. Throws NotFoundError when nothing is there. */
export function openForRead(sys: FdPaths, p: string): Opened {
  const fd = openChecked(sys, path.resolve(p), O_RDONLY | O_NONBLOCK, NEVER_OPENED)
  return { fd, stat: fs.fstatSync(fd) }
}

/** An existing file to change, opened at exactly `p`. Throws NotFoundError when nothing is there. */
export function openExistingForWrite(sys: FdPaths, p: string): Opened {
  const fd = openChecked(sys, path.resolve(p), O_RDWR | O_NONBLOCK, NEVER_WRITTEN)
  return { fd, stat: fs.fstatSync(fd) }
}

/**
 * An existing file to change or remove, opened read-only at exactly `p` and
 * never in the harness home. Throws NotFoundError when nothing is there.
 */
export function openExistingForChange(sys: FdPaths, p: string): Opened {
  const fd = openChecked(sys, path.resolve(p), O_RDONLY | O_NONBLOCK, NEVER_WRITTEN)
  return { fd, stat: fs.fstatSync(fd) }
}

/**
 * Runs `fn` on the entry at exactly `p` inside its folder, opened and checked
 * first and held while `fn` runs, so a folder swapped for a link cannot lead
 * it elsewhere. `fn` is given the entry's name inside the folder held; a link
 * there is its own entry. Throws NotFoundError when the folder or the entry is
 * missing.
 */
function inCheckedFolder<T>(sys: FdPaths, p: string, fn: (entry: string) => T): T {
  const full = path.resolve(p)
  if (full === '/' || under(full, NEVER_WRITTEN)) throw new PathChangedError(full)
  let dir: number
  try {
    dir = openChecked(sys, path.dirname(full), O_RDONLY | O_DIRECTORY, NEVER_WRITTEN)
  } catch (err) {
    if (errno(err) === 'ENOTDIR') throw notAFolder(path.dirname(full), full, err)
    if (err instanceof NotFoundError) throw new NotFoundError(full)
    throw err
  }
  try {
    return fn(sys.child(dir, path.basename(full)))
  } catch (err) {
    if (errno(err) === 'ENOENT') throw new NotFoundError(full)
    throw err
  } finally {
    closeQuietly(dir)
  }
}

/** What is at exactly `p`, a link itself rather than what it leads to, never in the harness home. */
export function entryStat(sys: FdPaths, p: string): FileStat {
  return inCheckedFolder(sys, p, entry => fs.lstatSync(entry))
}

/** Removes the entry at exactly `p` — a link itself, never what it leads to — inside its checked folder. */
export function removeFile(sys: FdPaths, p: string): void {
  inCheckedFolder(sys, p, entry => fs.unlinkSync(entry))
}

/**
 * A folder, created with any missing parents like `mkdir -p`, each made
 * inside its parent's checked descriptor and then checked itself.
 */
export function openFolderForWrite(sys: FdPaths, dir: string): number {
  const p = path.resolve(dir)
  try {
    return openChecked(sys, p, O_RDONLY | O_DIRECTORY, NEVER_WRITTEN)
  } catch (err) {
    if (errno(err) === 'ENOTDIR') throw notAFolder(p, p, err)
    if (!(err instanceof NotFoundError) || p === '/') throw err
  }
  const parent = openFolderForWrite(sys, path.dirname(p))
  try {
    const name = path.basename(p)
    try {
      fs.mkdirSync(sys.child(parent, name))
    } catch (err) {
      if (errno(err) !== 'EEXIST') throw err
    }
    const fd = sys.open(sys.child(parent, name), O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
    return verify(sys, fd, p, NEVER_WRITTEN)
  } catch (err) {
    if (errno(err) === 'ELOOP') throw new PathChangedError(p)
    if (errno(err) === 'ENOTDIR') throw notAFolder(sys.child(parent, path.basename(p)), p, err)
    throw err
  } finally {
    closeQuietly(parent)
  }
}

/**
 * A file to write, opened at exactly `p` — created, with its folders, when it
 * does not exist. `created` says which.
 */
export function openFileForWrite(sys: FdPaths, p: string): Opened & { created: boolean } {
  const full = path.resolve(p)
  if (under(full, NEVER_WRITTEN)) throw new PathChangedError(full)
  const dir = openFolderForWrite(sys, path.dirname(full))
  try {
    const at = sys.child(dir, path.basename(full))
    let fd: number
    let created = true
    try {
      fd = sys.open(at, O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW | O_NONBLOCK, 0o666)
    } catch (err) {
      if (errno(err) !== 'EEXIST') throw err
      created = false
      fd = sys.open(at, O_RDWR | O_NOFOLLOW | O_NONBLOCK)
    }
    verify(sys, fd, full, NEVER_WRITTEN)
    return { fd, stat: fs.fstatSync(fd), created }
  } catch (err) {
    if (errno(err) === 'ELOOP') throw new PathChangedError(full)
    throw err
  } finally {
    closeQuietly(dir)
  }
}

/** Every byte of an open file. */
export function readAll(fd: number): Uint8Array {
  const chunks: Buffer[] = []
  let position = 0
  for (;;) {
    const chunk = Buffer.alloc(64 * 1024)
    const n = fs.readSync(fd, chunk, 0, chunk.length, position)
    if (n === 0) break
    chunks.push(chunk.subarray(0, n))
    position += n
  }
  return Buffer.concat(chunks)
}

/** Replaces an open file's contents. */
export function replaceContents(fd: number, data: Uint8Array): void {
  fs.ftruncateSync(fd, 0)
  let written = 0
  while (written < data.length) written += fs.writeSync(fd, data, written, data.length - written, written)
}

/** The entries of an open folder, read through its descriptor. */
export function listFolder(sys: FdPaths, fd: number): FolderEntry[] {
  return fs.readdirSync(sys.child(fd, '.'), { withFileTypes: true })
}

export { closeQuietly }
