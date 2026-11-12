/**
 * A person's name and picture (every screen reviewed spec §3, People), set by
 * themselves in their Profile and by organisation admins. Their login name
 * stays their handle. The picture is written and served as an agent's is
 * (server/imageUpload.ts; opened through hq's relay, server/files/uploadAccess.ts); a cover beside it.
 */
import { HttpError, prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import { isOrgAdmin } from '../projects/membership'
import { normaliseDisplayName } from '../server/identity/personSummary'
import { writeUploadedPicture } from '../server/imageUpload'
import { getPersonImagesDir } from '../server/hqStoragePaths'
import { deletePictureFiles, redrawIfFollowsName, removePicture } from '../pictures/service'
import type {
  RemovePersonPictureArgs, RemovePersonPictureResult, SetPersonNameArgs, SetPersonNameResult, UploadPersonPictureArgs,
  UploadPersonPictureResult,
} from '@agenthix/core'

type Ctx = { user?: { id: string } | null }

async function requireMayEditProfile(context: Ctx, userId: unknown): Promise<void> {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (typeof userId !== 'string' || userId === '') throw new HttpError(400, 'Name the person')
  if (userId !== context.user.id && !(await isOrgAdmin(context.user.id))) {
    throw new HttpError(403, "Changing someone else's name or picture requires the ADMIN role")
  }
  const person = await prisma.user.findUnique({ where: { id: userId }, select: { erasedAt: true } })
  if (!person) throw new HttpError(404, 'Person not found')
  if (person.erasedAt) throw new HttpError(400, 'An erased person has no name or picture to change')
}

export const setPersonName = async (args: SetPersonNameArgs, context: Ctx): Promise<SetPersonNameResult> => {
  const userId = args?.userId
  await requireMayEditProfile(context, userId)
  let name: string | null
  try {
    name = normaliseDisplayName(args.displayName)
  } catch (err) {
    throw new HttpError(400, (err as Error).message)
  }
  await prisma.user.update({ where: { id: userId }, data: { displayName: name } })
  await redrawIfFollowsName({ kind: 'person', id: userId })
  return { displayName: name }
}

export const uploadPersonPicture = async (args: UploadPersonPictureArgs, context: Ctx): Promise<UploadPersonPictureResult> => {
  const userId = args?.userId
  await requireMayEditProfile(context, userId)
  const type = args.type ?? 'avatar'
  if (type !== 'avatar' && type !== 'cover') throw new HttpError(400, 'A picture is an avatar or a cover')
  const { fileName } = await writeUploadedPicture(getPersonImagesDir(userId), args.dataUrl, type)
  const url = `/people/${userId}/images/${fileName}`
  const data = type === 'avatar' ? { avatarUrl: url, avatarRecipe: Prisma.DbNull } : { coverUrl: url, coverRecipe: Prisma.DbNull }
  const previous = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true, coverUrl: true } })
  await prisma.user.update({ where: { id: userId }, data })
  await deletePictureFiles({ kind: 'person', id: userId }, type === 'avatar' ? previous?.avatarUrl : previous?.coverUrl)
  return { url }
}

/** Back to the initial on a colour; the old file and its small copy are deleted (pictures/service.ts). */
export const removePersonPicture = async (args: RemovePersonPictureArgs, context: Ctx): Promise<RemovePersonPictureResult> => {
  const userId = args?.userId
  await requireMayEditProfile(context, userId)
  await removePicture({ kind: 'person', id: userId }, 'avatar')
  return { ok: true }
}
