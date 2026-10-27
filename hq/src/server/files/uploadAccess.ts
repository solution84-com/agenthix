/**
 * Who may open which file hq keeps itself (adr-0153): decided when hq signs the ticket, since hq's relay serves the
 * file on that ticket alone. The rules are the ones the upload routes applied per request before they went:
 *
 * - a task attachment: a member of the task's project;
 * - an agent's, a person's or a team's picture: anyone signed in;
 * - the organisation's picture or cover: anyone signed in, and without a session only the current ones while the
 *   sign-in page shows the whole cover.
 *
 * The file must be on hq's disk at the place hq's relay will read it, with no link on the way (the relay refuses one
 * anyway), and its stat is the version the ticket names. A refusal of someone signed in never says whether the file
 * is there.
 */
import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from 'wasp/server'
import { isUploadPath } from '@agenthix/core'
import { getHqStorageRoot } from '../hqStoragePaths'
import { requireProjectMember } from '../../projects/membership'

export type UploadAccess = { ok: true; stat: Stats } | { ok: false; status: 401 | 404 }

const UNAUTHORIZED: UploadAccess = { ok: false, status: 401 }
const NOT_FOUND: UploadAccess = { ok: false, status: 404 }

// One file per upload, named by a fresh id: anything else under an images folder was not written by hq.
const PICTURE_NAME = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/
const UUID = /^[0-9a-f-]{36}$/i

/**
 * The sign-in page shows the organisation's current picture and cover when its admin chose the whole cover
 * (getting-in spec, Signing in); only those two files are opened without a session, and nothing older.
 */
export async function orgImageShownBeforeSignIn(filename: string): Promise<boolean> {
  const org = await prisma.org.findFirst({ select: { avatarUrl: true, coverUrl: true, signInShows: true } })
  if (!org || org.signInShows !== 'COVER') return false
  const url = `/org/images/${filename}`
  return org.avatarUrl === url || org.coverUrl === url
}

async function mayOpen(segments: string[], userId: string | null): Promise<boolean | 'unauthorized'> {
  const [first, second, third, fourth] = segments
  if (first === 'files') {
    if (!userId) return 'unauthorized'
    const task = await prisma.task.findUnique({ where: { id: third }, select: { projectId: true } })
    if (!task) return false
    try {
      await requireProjectMember(task.projectId, userId, "Opening this task's attachment")
      return true
    } catch {
      return false
    }
  }
  if (first === 'org') {
    if (!PICTURE_NAME.test(third)) return userId ? false : 'unauthorized'
    return userId ? true : (await orgImageShownBeforeSignIn(third)) || 'unauthorized'
  }
  if (!userId) return 'unauthorized'
  if (first === 'teams' && !UUID.test(second)) return false
  return PICTURE_NAME.test(fourth)
}

/** Where hq keeps an upload on its disk: task attachments under `tasks/`, every other path as it reads (as the relay maps it). */
function diskSegments(segments: string[]): string[] {
  return segments[0] === 'files' ? ['tasks', ...segments.slice(2)] : segments
}

async function plainFileAt(segments: string[]): Promise<Stats | null> {
  try {
    const root = await fs.realpath(getHqStorageRoot())
    const target = path.join(root, ...diskSegments(segments))
    if ((await fs.realpath(target)) !== target) return null
    const stat = await fs.stat(target)
    return stat.isFile() ? stat : null
  } catch {
    return null
  }
}

/** Whether `userId` (null: no session) may open the upload at `uploadPath`, and the file's stat when they may. */
export async function uploadAccess(uploadPath: string, userId: string | null): Promise<UploadAccess> {
  if (!isUploadPath(uploadPath)) return NOT_FOUND
  const segments = uploadPath.slice(1).split('/')
  const may = await mayOpen(segments, userId)
  if (may === 'unauthorized') return UNAUTHORIZED
  if (!may) return NOT_FOUND
  const stat = await plainFileAt(segments)
  return stat ? { ok: true, stat } : NOT_FOUND
}
