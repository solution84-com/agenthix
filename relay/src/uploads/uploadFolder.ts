/**
 * hq's storage folder, mounted read-only into hq's relay, and the one way a file in it is opened: by an upload path
 * core's `isUploadPath` accepts, at the place hq writes it, with no symbolic link anywhere on the way and no hard link
 * to it. The folder holds more than uploads (models, skills, caches); nothing outside the upload patterns is reached.
 */
import { constants, realpathSync, statSync, type Stats } from 'node:fs'
import { lstat, open, realpath, type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { isUploadPath } from '@agenthix/core'

export type UploadFolder = { readonly root: string }

/** The folder named by `HQ_UPLOADS_ROOT`, by its real path; or, in plain words, why uploads are not served. */
export function openUploadFolder(raw: string | undefined): { ok: true; folder: UploadFolder } | { ok: false; problem: string } {
  const given = raw?.trim()
  if (!given) {
    return { ok: false, problem: "HQ_UPLOADS_ROOT is not set: this relay does not serve HQ's uploads (task attachments and pictures). Mount hq's storage folder read-only and name it there." }
  }
  try {
    const root = realpathSync(given)
    if (statSync(root).isDirectory()) return { ok: true, folder: { root } }
  } catch {
    // Missing or unreadable: the same answer as a file.
  }
  return { ok: false, problem: `HQ_UPLOADS_ROOT (${given}) is not a folder this relay can read: it does not serve HQ's uploads. Mount hq's storage folder read-only there.` }
}

/** Where hq keeps an upload under its storage folder: task attachments under `tasks/`, every other path as it reads. */
export function uploadSegments(uploadPath: string): string[] | null {
  if (!isUploadPath(uploadPath)) return null
  const segments = uploadPath.slice(1).split('/')
  return segments[0] === 'files' && segments[1] === 'task' ? ['tasks', ...segments.slice(2)] : segments
}

export type OpenedUpload = { handle: FileHandle; stat: Stats }

/**
 * Opens an upload for reading, or null when it is not there or not reachable without a link — the two read the same.
 * The last part is opened with `O_NOFOLLOW`; the real path of what was asked must be exactly what was asked (a link
 * anywhere above it changes it); and the open descriptor must be the very entry now at that path, so a folder swapped
 * for a link between the check and the open is caught. A file with another hard link is refused, as a site refuses
 * one: no path check can tell which of its names is the real one. `O_NONBLOCK` keeps a FIFO from holding the open.
 */
export async function openUpload(folder: UploadFolder, uploadPath: string): Promise<OpenedUpload | null> {
  const segments = uploadSegments(uploadPath)
  if (!segments) return null
  const target = path.join(folder.root, ...segments)
  if (!target.startsWith(folder.root + path.sep)) return null

  let handle: FileHandle
  try {
    handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch {
    return null
  }
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('not a plain file')
    if ((await realpath(target)) !== target) throw new Error('reached through a link')
    const now = await lstat(target)
    if (now.dev !== stat.dev || now.ino !== stat.ino) throw new Error('changed while opened')
    return { handle, stat }
  } catch {
    await handle.close().catch(() => {})
    return null
  }
}
