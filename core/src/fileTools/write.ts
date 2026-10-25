/**
 * Writing a whole file inside a root, all or nothing: the content goes to a new file beside it, is flushed to disk,
 * and is then renamed over the name, so a reader sees the old file or the new one and never half of either. The
 * folder is opened and checked first (verifiedFs.ts) and held throughout, and missing folders are made the same way.
 *
 * `expectedVersion` is the version `read` gave: the write is refused if the file is no longer that file. `null` says
 * the file must not exist yet. Left out, the file is written whatever it holds.
 *
 * Synchronous on purpose: the check of the version and the rename run with nothing else of this process between them.
 */
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { resolveInsideRoot } from './paths.js'
import { MAX_FILE_BYTES, versionOf } from './read.js'
import { refusalFor, refused, type Refused } from './refusals.js'
import { systemFdPaths } from './systemFdPaths.js'
import {
  closeQuietly, NotFoundError, openExistingForChange, openFolderForWrite, readAll, type FdPaths,
} from './verifiedFs.js'

const { O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW } = fs.constants

export type WriteArgs = { file: string; content: string; expectedVersion?: string | null }

export type WriteResult = { ok: true; version: string; created: boolean } | Refused

type Current = { exists: false } | { exists: true; version: string; mode: number }

function current(sys: FdPaths, p: string): { ok: true; file: Current } | Refused {
  try {
    const opened = openExistingForChange(sys, p)
    try {
      if (!opened.stat.isFile()) return refused('not-a-file')
      if (opened.stat.size > MAX_FILE_BYTES) return refused('too-large')
      const mode = fs.fstatSync(opened.fd).mode & 0o7777
      return { ok: true, file: { exists: true, version: versionOf(readAll(opened.fd)), mode } }
    } finally {
      closeQuietly(opened.fd)
    }
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: true, file: { exists: false } }
    return refusalFor(err)
  }
}

function versionRefusal(file: Current, expected: string | null | undefined): Refused | null {
  if (expected === undefined) return null
  if (expected === null) return file.exists ? refused('exists') : null
  return file.exists && file.version === expected ? null : refused('changed')
}

export function write(root: string, args: WriteArgs, sys: FdPaths = systemFdPaths()): WriteResult {
  if (typeof args.content !== 'string') return refused('invalid-argument')
  const bytes = new TextEncoder().encode(args.content)
  if (bytes.length > MAX_FILE_BYTES) return refused('too-large')
  const resolved = resolveInsideRoot(root, args.file)
  if (!resolved.ok) return resolved
  const target = resolved.path
  const realRoot = resolveInsideRoot(root, '')
  if (!realRoot.ok || target === realRoot.path) return refused('not-a-file')

  let dir: number
  try {
    dir = openFolderForWrite(sys, path.dirname(target))
  } catch (err) {
    return refusalFor(err)
  }
  const temp = sys.child(dir, `.${randomBytes(8).toString('hex')}.tmp`)
  let tempMade = false
  try {
    const now = current(sys, target)
    if (!now.ok) return now
    const stale = versionRefusal(now.file, args.expectedVersion)
    if (stale) return stale

    const fd = sys.open(temp, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, now.file.exists ? now.file.mode : 0o666)
    tempMade = true
    try {
      if (now.file.exists) fs.fchmodSync(fd, now.file.mode)
      let written = 0
      while (written < bytes.length) written += fs.writeSync(fd, bytes, written, bytes.length - written)
      fs.fsyncSync(fd)
    } finally {
      closeQuietly(fd)
    }
    fs.renameSync(temp, sys.child(dir, path.basename(target)))
    tempMade = false
    return { ok: true, version: versionOf(bytes), created: !now.file.exists }
  } catch (err) {
    return refusalFor(err)
  } finally {
    if (tempMade) {
      try { fs.unlinkSync(temp) } catch { /* already gone */ }
    }
    closeQuietly(dir)
  }
}
