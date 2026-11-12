/**
 * The organisation's and each team's picture and cover (every screen reviewed
 * spec §3, Organisation: an identity has a hero), written as an
 * agent's are (`server/imageUpload.ts`): re-encoded, with a small copy, under
 * a fresh uuid in hq's own storage, its URL its version.
 *
 * Organisation admins change them. Who may open one is decided where hq signs
 * its ticket (server/files/uploadAccess.ts), and hq's relay serves it.
 */
import { HttpError, prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import path from 'node:path'
import { requireRole } from '../server/identity/requireRole'
import { writeUploadedPicture } from '../server/imageUpload'
import { deletePictureFiles, removePicture } from '../pictures/service'
import { getHqStorageRoot } from '../server/hqStoragePaths'

type Ctx = { user?: { id: string } | null }
export type IdentityImage = 'avatar' | 'cover'

const orgImagesDir = () => path.join(getHqStorageRoot(), 'org', 'images')
const teamImagesDir = (teamId: string) => path.join(getHqStorageRoot(), 'teams', teamId, 'images')

const FIELD: Record<IdentityImage, 'avatarUrl' | 'coverUrl'> = { avatar: 'avatarUrl', cover: 'coverUrl' }

function kindOf(type: unknown): IdentityImage {
  if (type !== 'avatar' && type !== 'cover') throw new HttpError(400, 'An image is a picture (avatar) or a cover')
  return type
}

/** The row's new picture, with that picture's recipe cleared: an upload is no longer drawn from one. */
function uploaded(type: IdentityImage, url: string) {
  return type === 'avatar' ? { avatarUrl: url, avatarRecipe: Prisma.DbNull } : { coverUrl: url, coverRecipe: Prisma.DbNull }
}

async function theOrg(): Promise<{ id: string; avatarUrl: string | null; coverUrl: string | null }> {
  const org = await prisma.org.findFirst({ select: { id: true, avatarUrl: true, coverUrl: true } })
  if (!org) throw new HttpError(409, 'There is no organisation yet')
  return org
}

export const uploadOrgImage = async (
  { type, dataUrl }: { type: IdentityImage; dataUrl: string },
  context: Ctx,
): Promise<{ url: string }> => {
  await requireRole(context, 'ADMIN', "Changing the organisation's picture or cover")
  const kind = kindOf(type)
  const org = await theOrg()
  const url = `/org/images/${(await writeUploadedPicture(orgImagesDir(), dataUrl, kind)).fileName}`
  await prisma.org.update({ where: { id: org.id }, data: uploaded(kind, url) })
  await deletePictureFiles({ kind: 'org', id: org.id }, org[FIELD[kind]])
  return { url }
}

/** Back to its generated symbol or cover (pictures/service.ts); the old file and its small copy are deleted. */
export const removeOrgImage = async ({ type }: { type: IdentityImage }, context: Ctx): Promise<{ url: string | null }> => {
  await requireRole(context, 'ADMIN', "Changing the organisation's picture or cover")
  const kind = kindOf(type)
  const org = await theOrg()
  const { url } = await removePicture({ kind: 'org', id: org.id }, kind)
  return { url }
}

export const uploadTeamImage = async (
  { teamId, type, dataUrl }: { teamId: string; type: IdentityImage; dataUrl: string },
  context: Ctx,
): Promise<{ url: string }> => {
  await requireRole(context, 'ADMIN', "Changing a team's picture or cover")
  const kind = kindOf(type)
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, avatarUrl: true, coverUrl: true } })
  if (!team) throw new HttpError(404, 'Team not found')
  const url = `/teams/${team.id}/images/${(await writeUploadedPicture(teamImagesDir(team.id), dataUrl, kind)).fileName}`
  await prisma.team.update({ where: { id: team.id }, data: uploaded(kind, url) })
  await deletePictureFiles({ kind: 'team', id: team.id }, team[FIELD[kind]])
  return { url }
}

export const removeTeamImage = async ({ teamId, type }: { teamId: string; type: IdentityImage }, context: Ctx): Promise<{ url: string | null }> => {
  await requireRole(context, 'ADMIN', "Changing a team's picture or cover")
  const kind = kindOf(type)
  if (!(await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } }))) throw new HttpError(404, 'Team not found')
  // Back to its generated Initials or cover.
  const { url } = await removePicture({ kind: 'team', id: teamId }, kind)
  return { url }
}
