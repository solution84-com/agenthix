/**
 * The picture sweep (spec, *Replaced and removed files are deleted*): at start and once a day, every file in an
 * agent's, a person's, a team's or the organisation's images folder that no row names is deleted, and so is the
 * images folder of an owner that no longer exists. It covers a delete that failed and whatever was deleted — an agent,
 * a person, a team — without each delete path having to remember its pictures. A file written less than an hour ago
 * is left alone, so a picture being saved is never swept from under its row.
 *
 * Only plain folders inside hq's storage root are read, reached through no symbolic link; a link inside one is removed
 * itself, never followed (folders.ts).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from 'wasp/server'
import type { SubjectKind } from '../shared/pictures/recipe'
import { getHqStorageRoot } from '../server/hqStoragePaths'
import { Logger } from '../server/utils/logger'
import { SUBJECT_FOLDERS, fileNamedBy, filesOf, pictureFolder, plainFolderWithin, removeEntry } from './folders'

const logger = new Logger('Pictures')

export const PICTURE_SWEEP_GRACE_MS = 60 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

interface PictureRow { id: string; avatarUrl: string | null; coverUrl: string | null }
const SELECT = { id: true, avatarUrl: true, coverUrl: true } as const

export interface SweepResult { files: number; folders: number }

async function rowsOf(kind: SubjectKind): Promise<PictureRow[]> {
  switch (kind) {
    case 'agent': return prisma.agent.findMany({ select: SELECT })
    case 'person': return prisma.user.findMany({ select: SELECT })
    case 'team': return prisma.team.findMany({ select: SELECT })
    case 'org': return prisma.org.findMany({ select: SELECT })
  }
}

/** The files a subject's rows name in its folder: each picture and its small copy. */
function namedFiles(kind: SubjectKind, rows: PictureRow[]): Set<string> {
  const named = new Set<string>()
  for (const row of rows) {
    const folder = pictureFolder({ kind, id: row.id })
    for (const url of [row.avatarUrl, row.coverUrl]) {
      const name = fileNamedBy(folder, url)
      if (name) for (const file of filesOf(name)) named.add(file)
    }
  }
  return named
}

/**
 * Deletes what nothing names in one images folder, past the grace period. For an owner that no longer exists the
 * folder goes too once it is empty, and with `andOwnerFolder` the owner's folder above it (`agents/<id>`) when that
 * is empty as well; rmdir refuses a folder that is not, so a file still in its grace period keeps both.
 */
async function sweepFolder(dir: string, named: Set<string>, cutoff: number, result: SweepResult, ownerGone: { andOwnerFolder: boolean } | null): Promise<void> {
  const realDir = await plainFolderWithin(dir)
  if (!realDir) return
  for (const entry of await fs.readdir(realDir, { withFileTypes: true })) {
    if (named.has(entry.name) || entry.isDirectory()) continue
    const stat = await fs.lstat(path.join(realDir, entry.name)).catch(() => null)
    if (!stat || stat.mtimeMs > cutoff) continue
    if (await removeEntry(realDir, entry.name)) result.files += 1
  }
  if (!ownerGone) return
  // A folder made in the last hour may belong to a row made after the rows were read: leave it to the next sweep.
  const folder = await fs.lstat(realDir).catch(() => null)
  if (!folder || folder.mtimeMs > cutoff) return
  try {
    await fs.rmdir(realDir)
  } catch {
    return
  }
  result.folders += 1
  if (ownerGone.andOwnerFolder) await fs.rmdir(path.dirname(realDir)).catch(() => {})
}

export async function sweepPictures(now: Date = new Date()): Promise<SweepResult> {
  const cutoff = now.getTime() - PICTURE_SWEEP_GRACE_MS
  const result: SweepResult = { files: 0, folders: 0 }

  for (const [kind, top] of Object.entries(SUBJECT_FOLDERS) as Array<[Exclude<SubjectKind, 'org'>, string]>) {
    const byId = new Map((await rowsOf(kind)).map(row => [row.id, row]))
    const topDir = await plainFolderWithin(path.join(getHqStorageRoot(), top))
    if (!topDir) continue
    for (const entry of await fs.readdir(topDir, { withFileTypes: true })) {
      const { dir } = pictureFolder({ kind, id: entry.name })
      if (!entry.isDirectory() || !dir) continue
      const row = byId.get(entry.name)
      await sweepFolder(dir, row ? namedFiles(kind, [row]) : new Set(), cutoff, result, row ? null : { andOwnerFolder: true })
    }
  }

  // The organisation's one folder; `org/` above it holds other things (its skills) and always stays.
  const orgRows = await rowsOf('org')
  const orgDir = pictureFolder({ kind: 'org', id: '' }).dir as string
  await sweepFolder(orgDir, namedFiles('org', orgRows), cutoff, result, orgRows.length > 0 ? null : { andOwnerFolder: false })
  return result
}

let timer: NodeJS.Timeout | null = null

/** Sweeps now and then once a day; a failed sweep is logged and tried again the next day, and it never overlaps itself. */
export function startPictureSweep(intervalMs = DAY): void {
  if (timer) return
  let running = false
  const run = () => {
    if (running) return
    running = true
    sweepPictures()
      .then(r => { if (r.files + r.folders > 0) logger.info(`swept ${r.files} picture file(s) and ${r.folders} folder(s) nothing names`) })
      .catch(err => logger.warn(`picture sweep failed: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => { running = false })
  }
  run()
  timer = setInterval(run, intervalMs)
  timer.unref?.()
}
