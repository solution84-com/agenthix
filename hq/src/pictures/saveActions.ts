/**
 * `savePictures`, the picker's Save (generated avatars and covers spec, *The picker*): an avatar, a cover or both of
 * one subject, each a recipe hq draws, an upload hq re-encodes, or a removal. Each subject keeps the permission rule its
 * own upload had (`saveSubject.ts`). Saving costs the server a drawing and four files, so it is rate-limited per person
 * (30 pictures a minute) and, in a demo, the bytes written count to the visitor's storage budget.
 */
import { HttpError, prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { PictureChange, PictureRecipeView, SavePicturesArgs, SavePicturesResult } from '@agenthix/core'
import type { PictureKind } from '../shared/pictures/recipe'
import { smallPictureName } from '../shared/pictures/files'
import { writeUploadedPicture } from '../server/imageUpload'
import { getHqStorageRoot } from '../server/hqStoragePaths'
import { demoOn } from '../demo/demoMode'
import { budgetRefusal, chargeWritten } from '../demo/guard/storageBudget'
import { Logger } from '../server/utils/logger'
import { deletePictureFiles, removePicture, saveRecipePicture, type PictureOwner } from './service'
import { PICTURE_SAVE_LIMIT, TOO_MANY_SAVES, takePictureSave } from './saveLimit'
import { authorisedOwner, imagesOf, readSubject } from './saveSubject'

const logger = new Logger('Pictures')

type Ctx = { user?: { id: string } | null }

export const PICTURE_SAVE_RULE = PICTURE_SAVE_LIMIT
export { TOO_MANY_SAVES }

type Change = { type: 'recipe'; recipe: unknown } | { type: 'upload'; dataUrl: string } | { type: 'remove' }

function readChange(raw: unknown, kind: PictureKind): Change | null {
  if (raw === undefined || raw === null) return null
  const c = raw as Partial<Record<'recipe' | 'upload' | 'remove', unknown>>
  const keys = typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw) : []
  if (keys.length !== 1) throw new HttpError(400, `The ${kind} is a recipe, an upload or a removal`)
  if (keys[0] === 'recipe') return { type: 'recipe', recipe: c.recipe }
  if (keys[0] === 'upload' && typeof c.upload === 'string') return { type: 'upload', dataUrl: c.upload }
  if (keys[0] === 'remove' && c.remove === true) return { type: 'remove' }
  throw new HttpError(400, `The ${kind} is a recipe, an upload or a removal`)
}

async function deleteReplaced(owner: PictureOwner, previousUrl: string | null): Promise<void> {
  await deletePictureFiles(owner, previousUrl)
}

/** The bytes a stored picture and its small copy take, for the demo's budget; 0 for one that cannot be read. */
async function bytesOf(url: string | null): Promise<number> {
  if (!url) return 0
  const full = path.join(getHqStorageRoot(), url)
  const sizes = await Promise.all([full, path.join(path.dirname(full), smallPictureName(path.basename(full)))].map(f =>
    fs.stat(f).then(s => s.size, () => 0)))
  return sizes[0] + sizes[1]
}

async function apply(owner: PictureOwner, kind: PictureKind, change: Change): Promise<number> {
  switch (change.type) {
    case 'recipe':
      return bytesOf((await saveRecipePicture(owner, kind, change.recipe)).url)
    case 'upload': {
      const images = imagesOf(owner)
      const written = await writeUploadedPicture(images.dir, change.dataUrl, kind)
      const url = images.url(written.fileName)
      const data = kind === 'avatar' ? { avatarUrl: url, avatarRecipe: Prisma.DbNull } : { coverUrl: url, coverRecipe: Prisma.DbNull }
      const previous = await picturesOf(owner)
      // A person erased while this was drawn keeps no picture: the row is written only while it is not erased.
      const where = owner.kind === 'person' ? { id: owner.id, erasedAt: null } : { id: owner.id }
      if ((await rowsOf(owner).updateMany({ where, data })).count === 0) {
        await deleteReplaced(owner, url)
        throw new HttpError(404, 'Not found')
      }
      // After the row: it never points at a missing file; a failed delete is left to the sweep.
      await deleteReplaced(owner, kind === 'avatar' ? previous.avatarUrl : previous.coverUrl)
      return written.bytes
    }
    case 'remove':
      await removePicture(owner, kind)
      return 0
  }
}

type PictureRow = { avatarUrl: string | null; avatarRecipe: Prisma.JsonValue | null; coverUrl: string | null; coverRecipe: Prisma.JsonValue | null }
interface PictureRows {
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>
  findUnique(args: { where: { id: string }; select: Record<keyof PictureRow, true> }): Promise<PictureRow | null>
}
function rowsOf(owner: PictureOwner): PictureRows {
  // The four models share these four columns; Prisma types each delegate apart.
  return ({ agent: prisma.agent, person: prisma.user, team: prisma.team, org: prisma.org }[owner.kind]) as unknown as PictureRows
}

async function picturesOf(owner: PictureOwner): Promise<SavePicturesResult> {
  const row = await rowsOf(owner).findUnique({
    where: { id: owner.id },
    select: { avatarUrl: true, avatarRecipe: true, coverUrl: true, coverRecipe: true },
  })
  if (!row) throw new HttpError(404, 'Not found')
  return {
    avatarUrl: row.avatarUrl,
    avatarRecipe: row.avatarRecipe as unknown as PictureRecipeView | null,
    coverUrl: row.coverUrl,
    coverRecipe: row.coverRecipe as unknown as PictureRecipeView | null,
  }
}

export const savePictures = async (args: SavePicturesArgs, context: Ctx): Promise<SavePicturesResult> => {
  if (!context.user) throw new HttpError(401)
  const userId = context.user.id
  const subject = readSubject(args?.subject)
  const changes = (['avatar', 'cover'] as const)
    .map(kind => ({ kind, change: readChange((args as Record<string, unknown>)[kind] as PictureChange | undefined, kind) }))
    .filter((c): c is { kind: PictureKind; change: Change } => c.change !== null)
  if (changes.length === 0) throw new HttpError(400, 'Nothing to save')
  const owner = await authorisedOwner(subject, context)

  for (const _ of changes) {
    if (!(await takePictureSave(userId))) throw new HttpError(429, TOO_MANY_SAVES)
  }
  const demo = demoOn()
  if (demo) {
    const refusal = await budgetRefusal(userId)
    if (refusal) throw new HttpError(403, refusal, { demo: true })
  }

  let written = 0
  try {
    for (const { kind, change } of changes) written += await apply(owner, kind, change)
  } finally {
    if (demo) await chargeWritten(userId, written).catch((err: unknown) => logger.warn('could not count the bytes a picture wrote', err))
  }
  return picturesOf(owner)
}
