/**
 * The knowledge store's one way onto the disk: every name a caller gives is resolved inside its root by the file
 * tools (`@agenthix/core/file-tools`), which refuse `..`, absolute names and links, and every page is read and
 * written by them. A refusal is thrown as `KnowledgeFileRefusal` and carries only the file tools' reason; its detail is
 * for the log.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  readTextFile,
  removeFile,
  resolveInsideRoot,
  systemFdPaths,
  versionOf,
  write,
  type FileToolRefusal,
  type Refused,
} from '@agenthix/core/file-tools'

export class KnowledgeFileRefusal extends Error {
  constructor(readonly reason: FileToolRefusal, readonly detail?: string) {
    super(`knowledge file refused: ${reason}`)
  }
}

function fail(refusal: Refused): never {
  throw new KnowledgeFileRefusal(refusal.reason, refusal.detail)
}

/** A folder the site itself makes (a page or version root); never a name a caller gave. */
export function ensureRoot(root: string): void {
  fs.mkdirSync(root, { recursive: true })
}

export function rootExists(root: string): boolean {
  try {
    return fs.lstatSync(root).isDirectory()
  } catch {
    return false
  }
}

/** `name` inside `root`, or a refusal. The root must exist. */
export function inside(root: string, name: string): string {
  const resolved = resolveInsideRoot(root, name)
  if (!resolved.ok) fail(resolved)
  return resolved.path
}

export interface PageText {
  text: string
  version: string
  bytes: number
}

/** The text at `name` inside `root`, or null when there is nothing there. */
export function readText(root: string, name: string): PageText | null {
  if (!rootExists(root)) return null
  const file = readTextFile(systemFdPaths(), inside(root, name))
  if (!file.ok) {
    if (file.reason === 'not-found') return null
    fail(file)
  }
  return { text: new TextDecoder('utf-8').decode(file.bytes), version: versionOf(file.bytes), bytes: file.bytes.length }
}

/**
 * Writes `content` at `name` inside `root`, beside and then renamed in. `expectedVersion` as the file tools' `write`:
 * a version the file must still have, null for a file that must not exist yet.
 */
export function writeText(root: string, name: string, content: string, expectedVersion?: string | null): string {
  ensureRoot(root)
  const done = write(root, { file: name, content, expectedVersion })
  if (!done.ok) fail(done)
  return done.version
}

/** Removes the file at `name` inside `root`; false when nothing was there. */
export function removeText(root: string, name: string): boolean {
  if (!rootExists(root)) return false
  const at = inside(root, name)
  try {
    if (!fs.lstatSync(at).isFile()) throw new KnowledgeFileRefusal('not-a-file')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
  try {
    removeFile(systemFdPaths(), at)
    return true
  } catch (err) {
    if ((err as { name?: string }).name === 'NotFoundError') return false
    throw new KnowledgeFileRefusal('failed', err instanceof Error ? err.message : String(err))
  }
}

/** Removes the empty folders from `name`'s folder up to, and never including, `root`. */
export function pruneEmptyFolders(root: string, name: string): void {
  const realRoot = inside(root, '')
  let dir = path.dirname(inside(root, name))
  while (dir !== realRoot && dir.startsWith(realRoot + path.sep)) {
    try {
      fs.rmdirSync(dir)
    } catch {
      return
    }
    dir = path.dirname(dir)
  }
}

/** The entries of a folder the site made, links and hidden names left out. Empty when it is not there. */
export function entriesOf(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => !d.name.startsWith('.') && !d.isSymbolicLink())
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}
