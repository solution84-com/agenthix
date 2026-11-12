/**
 * Where a subject's pictures live on hq's disk, and the two checks every delete of one makes (ADR-0187): the folder is
 * a plain directory inside hq's storage root with no symbolic link on the way, and only a plain file or a link itself
 * is removed, never what a link points at. A row's url names a picture as `/<kind>/<id>/images/<file>`; a url of any
 * other shape — an older preset path, another subject's folder — names nothing here and is never acted on.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { SubjectKind } from '../shared/pictures/recipe'
import { isSmallPictureName, smallPictureName } from '../shared/pictures/files'
import { getHqStorageRoot } from '../server/hqStoragePaths'

/** The top-level folder each subject's pictures are kept under; the organisation's is one folder, `org/images`. */
export const SUBJECT_FOLDERS: Readonly<Record<Exclude<SubjectKind, 'org'>, string>> = {
  agent: 'agents', person: 'people', team: 'teams',
}

/** An id or a file name hq wrote: never a separator, never `.` or `..`. */
const PLAIN_ID = /^[A-Za-z0-9_-]+$/
const PICTURE_FILE = /^[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/i

export interface PictureFolder {
  /** The folder on disk; null where the id is not one hq could have written (the folder is then never touched). */
  dir: string | null
  /** The url a row records for one of its files. */
  url(fileName: string): string
}

export function pictureFolder(owner: { kind: SubjectKind; id: string }): PictureFolder {
  if (owner.kind === 'org') return { dir: path.join(getHqStorageRoot(), 'org', 'images'), url: f => `/org/images/${f}` }
  const top = SUBJECT_FOLDERS[owner.kind]
  return {
    dir: PLAIN_ID.test(owner.id) ? path.join(getHqStorageRoot(), top, owner.id, 'images') : null,
    url: f => `/${top}/${owner.id}/images/${f}`,
  }
}

/** The file a row's url names in this subject's folder, or null when the url names none of its pictures. */
export function fileNamedBy(folder: PictureFolder, url: string | null | undefined): string | null {
  if (!url) return null
  const prefix = folder.url('')
  if (!url.startsWith(prefix)) return null
  const name = url.slice(prefix.length)
  return PICTURE_FILE.test(name) ? name : null
}

/** A picture's files: the full one and, for a stored WebP, its small copy beside it. */
export function filesOf(fileName: string): string[] {
  return /\.webp$/.test(fileName) && !isSmallPictureName(fileName) ? [fileName, smallPictureName(fileName)] : [fileName]
}

/**
 * The folder's real path when it is a directory inside hq's storage root reached through no symbolic link, at any
 * level below the root; null otherwise, a missing folder included.
 */
export async function plainFolderWithin(dir: string): Promise<string | null> {
  try {
    const root = await fs.realpath(getHqStorageRoot())
    const relative = path.relative(path.resolve(getHqStorageRoot()), path.resolve(dir))
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null
    let current = root
    for (const part of relative.split(path.sep)) {
      current = path.join(current, part)
      const stat = await fs.lstat(current)
      if (stat.isSymbolicLink() || !stat.isDirectory()) return null
    }
    return current
  } catch {
    return null
  }
}

/**
 * Removes one entry of a plain folder (from `plainFolderWithin`): a file, or a symbolic link itself. A directory is
 * left alone, and a missing entry is nothing to do. `name` must be a bare name.
 */
export async function removeEntry(realDir: string, name: string): Promise<boolean> {
  if (!PLAIN_FILE_NAME.test(name)) return false
  const target = path.join(realDir, name)
  try {
    const stat = await fs.lstat(target)
    if (stat.isDirectory()) return false
    await fs.unlink(target)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
}

const PLAIN_FILE_NAME = /^[^/\\]+$/
