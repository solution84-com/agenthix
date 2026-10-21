/**
 * The organisation's and each team's picture and cover (every screen reviewed
 * spec §3, Organisation: an identity has a hero), written and served as an
 * agent's are (`server/imageUpload.ts`, `server/imageHandlers.ts`): one file
 * per upload under a fresh uuid in hq's own storage, its URL its version.
 *
 * Organisation admins change them. Serving needs a link made for a signed-in
 * person and nothing more (server/files/fileAccess.ts): the organisation and
 * its teams are shown to everyone in it.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Request, Response } from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { requireRole } from '../server/identity/requireRole'
import { writeImageFromDataUrl } from '../server/imageUpload'
import { getHqStorageRoot } from '../server/hqStoragePaths'
import { resolveRealPathWithin } from '../server/realPathWithin'
import { readerOf, sendUpload } from '../server/files/fileAccess'

type Ctx = { user?: { id: string } | null }
export type IdentityImage = 'avatar' | 'cover'

const orgImagesDir = () => path.join(getHqStorageRoot(), 'org', 'images')
const teamImagesDir = (teamId: string) => path.join(getHqStorageRoot(), 'teams', teamId, 'images')

const FIELD: Record<IdentityImage, 'avatarUrl' | 'coverUrl'> = { avatar: 'avatarUrl', cover: 'coverUrl' }

function fieldOf(type: unknown): 'avatarUrl' | 'coverUrl' {
  if (type !== 'avatar' && type !== 'cover') throw new HttpError(400, 'An image is a picture (avatar) or a cover')
  return FIELD[type]
}

async function theOrg(): Promise<{ id: string }> {
  const org = await prisma.org.findFirst({ select: { id: true } })
  if (!org) throw new HttpError(409, 'There is no organisation yet')
  return org
}

export const uploadOrgImage = async (
  { type, dataUrl }: { type: IdentityImage; dataUrl: string },
  context: Ctx,
): Promise<{ url: string }> => {
  await requireRole(context, 'ADMIN', "Changing the organisation's picture or cover")
  const field = fieldOf(type)
  const org = await theOrg()
  const url = `/org/images/${await writeImageFromDataUrl(orgImagesDir(), dataUrl)}`
  await prisma.org.update({ where: { id: org.id }, data: { [field]: url } })
  return { url }
}

/** Back to none. The file stays, as an agent's old images do. */
export const removeOrgImage = async ({ type }: { type: IdentityImage }, context: Ctx): Promise<{ ok: true }> => {
  await requireRole(context, 'ADMIN', "Changing the organisation's picture or cover")
  const field = fieldOf(type)
  const org = await theOrg()
  await prisma.org.update({ where: { id: org.id }, data: { [field]: null } })
  return { ok: true }
}

export const uploadTeamImage = async (
  { teamId, type, dataUrl }: { teamId: string; type: IdentityImage; dataUrl: string },
  context: Ctx,
): Promise<{ url: string }> => {
  await requireRole(context, 'ADMIN', "Changing a team's picture or cover")
  const field = fieldOf(type)
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } })
  if (!team) throw new HttpError(404, 'Team not found')
  const url = `/teams/${team.id}/images/${await writeImageFromDataUrl(teamImagesDir(team.id), dataUrl)}`
  await prisma.team.update({ where: { id: team.id }, data: { [field]: url } })
  return { url }
}

export const removeTeamImage = async ({ teamId, type }: { teamId: string; type: IdentityImage }, context: Ctx): Promise<{ ok: true }> => {
  await requireRole(context, 'ADMIN', "Changing a team's picture or cover")
  const field = fieldOf(type)
  const { count } = await prisma.team.updateMany({ where: { id: teamId }, data: { [field]: null } })
  if (count === 0) throw new HttpError(404, 'Team not found')
  return { ok: true }
}

// ── Serving ─────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const VALID_FILENAME = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/

// Wasp hands every api handler a third argument, its context; these need none.
export const orgImageHandler = async (req: Request, res: Response, _context?: unknown) =>
  serve(req, res, orgImagesDir(), await shownBeforeSignIn((req.params as { filename: string }).filename))

// The sign-in page shows the organisation's current picture and cover when its admin chose the whole cover
// (getting-in spec, Signing in); only those two files are served on a link made without a session, and nothing older.
async function shownBeforeSignIn(filename: string): Promise<boolean> {
  const org = await prisma.org.findFirst({ select: { avatarUrl: true, coverUrl: true, signInShows: true } })
  if (!org || org.signInShows !== 'COVER') return false
  const url = `/org/images/${filename}`
  return org.avatarUrl === url || org.coverUrl === url
}

export const teamImageHandler = (req: Request, res: Response, _context?: unknown) => {
  const { teamId } = req.params as { teamId: string }
  // The id is a uuid; anything else could aim the path elsewhere before the containment check.
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) return res.status(404).json({ error: 'Image not found' })
  return serve(req, res, teamImagesDir(teamId))
}

async function serve(req: Request, res: Response, dir: string, isPublic = false) {
  const reader = readerOf(req, res)
  if (!reader) return
  if (!isPublic && !reader.userId) return res.status(401).json({ error: 'Unauthorized' })
  const { filename } = req.params as { filename: string }
  if (!VALID_FILENAME.test(filename)) return res.status(400).json({ error: 'Invalid filename' })
  const real = await resolveRealPathWithin(getHqStorageRoot(), path.join(dir, filename))
  if (!real) return res.status(404).json({ error: 'Image not found' })
  try {
    const buf = await fs.readFile(real)
    // As an agent's: for the one link, so never a shared cache.
    return sendUpload(res, buf, {
      type: MIME[path.extname(filename)] ?? 'application/octet-stream', inline: true, filename, cache: 'private, max-age=600', reader,
    })
  } catch {
    return res.status(404).json({ error: 'Image not found' })
  }
}
