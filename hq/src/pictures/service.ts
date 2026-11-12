/**
 * The picture service (ADR-0187): the one way a generated picture reaches a row. An agent's, a person's, a team's or
 * the organisation's avatar or cover is drawn from a recipe, written through `writePicture` into that subject's own
 * images folder, and recorded as its url and its recipe together, in one update.
 *
 * - `saveRecipePicture` saves a chosen recipe, and throws when it is refused (400) or cannot be made.
 * - `applyDefaultPictures` gives a subject what the spec's defaults say, only where it has no picture yet, and never
 *   throws: a picture that cannot be made must not stop the agent, person or team being made.
 * - `redrawIfFollowsName` draws again a picture whose style follows the name (Initials), after a rename.
 * - `removePicture` takes a picture back to what the spec's table says; `deletePictureFiles` deletes a picture a row
 *   no longer names. Every replace and remove deletes the old file and its small copy once the row is updated.
 */
import { HttpError, prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { defaultAvatarRecipe, randomRecipe } from '../shared/pictures/pictures'
import type { PictureContext, PictureKind, PictureRecipe, SubjectKind } from '../shared/pictures/recipe'
import { findStyle } from '../shared/pictures/styles'
import { smallPictureName } from '../shared/pictures/files'
import { Logger } from '../server/utils/logger'
import type { PictureAssets } from './render'
import { NO_ROBOT_FILES, getRobots } from './robots'
import { writePicture } from './writePicture'
import { KERNEL_HANDLE } from '../agents/kernelGuards'
import { fileNamedBy, filesOf, pictureFolder, plainFolderWithin, removeEntry } from './folders'

const logger = new Logger('Pictures')

/** Whose picture: the row's kind and id. The organisation is its one row's id. */
export interface PictureOwner {
  kind: SubjectKind
  id: string
}

/** The four picture fields a subject's row holds. */
export interface PictureFields {
  avatarUrl: string | null
  avatarRecipe: PictureRecipe | null
  coverUrl: string | null
  coverRecipe: PictureRecipe | null
}

export interface SavedPicture {
  url: string
  recipe: PictureRecipe
}

/** The cover style every default cover is drawn in. */
export const DEFAULT_COVER_STYLE = 'patterns'

interface OwnerRow extends PictureFields {
  name: string
  isKernel: boolean
}

const PICTURE_SELECT = { avatarUrl: true, avatarRecipe: true, coverUrl: true, coverRecipe: true } as const

const asRecipe = (value: Prisma.JsonValue | null): PictureRecipe | null => (value === null ? null : (value as unknown as PictureRecipe))
const fields = (row: { avatarUrl: string | null; avatarRecipe: Prisma.JsonValue | null; coverUrl: string | null; coverRecipe: Prisma.JsonValue | null }): PictureFields => ({
  avatarUrl: row.avatarUrl, avatarRecipe: asRecipe(row.avatarRecipe), coverUrl: row.coverUrl, coverRecipe: asRecipe(row.coverRecipe),
})

async function readOwner(owner: PictureOwner): Promise<OwnerRow | null> {
  switch (owner.kind) {
    case 'agent': {
      const row = await prisma.agent.findUnique({ where: { id: owner.id }, select: { name: true, isKernel: true, ...PICTURE_SELECT } })
      return row && { ...fields(row), name: row.name, isKernel: row.isKernel }
    }
    case 'person': {
      const row = await prisma.user.findUnique({
        where: { id: owner.id },
        select: { displayName: true, auth: { select: { identities: { select: { providerUserId: true }, take: 1 } } }, ...PICTURE_SELECT },
      })
      if (!row) return null
      const name = row.displayName ?? row.auth?.identities[0]?.providerUserId ?? ''
      return { ...fields(row), name, isKernel: false }
    }
    case 'team': {
      const row = await prisma.team.findUnique({ where: { id: owner.id }, select: { name: true, ...PICTURE_SELECT } })
      return row && { ...fields(row), name: row.name, isKernel: false }
    }
    case 'org': {
      const row = await prisma.org.findUnique({ where: { id: owner.id }, select: { name: true, ...PICTURE_SELECT } })
      return row && { ...fields(row), name: row.name, isKernel: false }
    }
  }
}

/** Where a subject's pictures are written, and the url its row records for one of them. */
function imagesOf(owner: PictureOwner): { dir: string; url(fileName: string): string } {
  const folder = pictureFolder(owner)
  // An id hq could not have written has no row either; refused before anything is drawn.
  if (folder.dir === null) throw notFound()
  return { dir: folder.dir, url: folder.url }
}

/**
 * Deletes the files of a picture the row no longer names (spec, *Replaced and removed files are deleted*): the file
 * `previousUrl` names in this subject's own images folder and its small copy. Called only after the row's update has
 * landed. A url that names nothing in that folder is left alone. Never throws: a delete that fails is logged and left
 * to the picture sweep.
 */
export async function deletePictureFiles(owner: PictureOwner, previousUrl: string | null | undefined): Promise<void> {
  const folder = pictureFolder(owner)
  const name = fileNamedBy(folder, previousUrl)
  if (!name || folder.dir === null) return
  try {
    const realDir = await plainFolderWithin(folder.dir)
    if (!realDir) {
      logger.warn(`The old picture of ${owner.kind} ${owner.id} was not deleted: its folder is not a plain folder in hq's storage`)
      return
    }
    for (const file of filesOf(name)) await removeEntry(realDir, file)
  } catch (err) {
    logger.warn(`The old picture of ${owner.kind} ${owner.id} was not deleted; the picture sweep will:`, err)
  }
}

/**
 * Whether a write replaces whatever the row holds (`'any'`), or lands only while the row still holds this url: a
 * default's write expects none, a re-draw the picture it re-draws, so a picture someone chose meanwhile is never
 * replaced.
 */
type Expect = 'any' | { url: string | null }

/** Records a picture's url and recipe on the row in one update; returns whether the row was written. */
async function recordPicture(owner: PictureOwner, kind: PictureKind, url: string, recipe: PictureRecipe, expect: Expect): Promise<boolean> {
  const urlField = kind === 'avatar' ? 'avatarUrl' : 'coverUrl'
  const data = { [urlField]: url, [kind === 'avatar' ? 'avatarRecipe' : 'coverRecipe']: recipe as unknown as Prisma.InputJsonValue }
  const where = {
    id: owner.id,
    ...(owner.kind === 'person' ? { erasedAt: null } : {}),
    ...(expect === 'any' ? {} : { [urlField]: expect.url }),
  }
  const delegate = { agent: prisma.agent, person: prisma.user, team: prisma.team, org: prisma.org }[owner.kind] as unknown as {
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>
  }
  return (await delegate.updateMany({ where, data })).count === 1
}

async function picturesNeeds(): Promise<{ robots: readonly string[] | null; assets: PictureAssets }> {
  const robots = await getRobots()
  return { robots: robots?.names ?? null, assets: robots ?? NO_ROBOT_FILES }
}

function contextOf(owner: PictureOwner, row: OwnerRow, robots: readonly string[] | null): PictureContext {
  return { subject: { kind: owner.kind, name: row.name, ...(row.isKernel ? { isKernel: true } : {}) }, robots }
}

/** The subject's picture context: its kind, current name, whether it is Kernel, and the robots installed. Null where the row is gone. */
export async function pictureContextFor(owner: PictureOwner): Promise<PictureContext | null> {
  const row = await readOwner(owner)
  if (!row) return null
  return contextOf(owner, row, (await picturesNeeds()).robots)
}

async function drawAndRecord(owner: PictureOwner, row: OwnerRow, kind: PictureKind, recipe: unknown, expect: Expect): Promise<SavedPicture | null> {
  const { robots, assets } = await picturesNeeds()
  const images = imagesOf(owner)
  const written = await writePicture(images.dir, { type: 'recipe', recipe, kind, context: contextOf(owner, row, robots), assets })
  const url = images.url(written.fileName)
  const saved = written.recipe as PictureRecipe
  let recorded = false
  try {
    recorded = await recordPicture(owner, kind, url, saved, expect)
  } finally {
    // Not recorded (the row is gone, the picture changed meanwhile, or the update failed): nothing points at the files.
    if (!recorded) await Promise.all([written.fileName, smallPictureName(written.fileName)].map(f => fs.rm(path.join(images.dir, f), { force: true })))
  }
  if (!recorded) return null
  await deletePictureFiles(owner, kind === 'avatar' ? row.avatarUrl : row.coverUrl)
  return { url, recipe: saved }
}

/**
 * Draws `recipe` and makes it the subject's avatar or cover. A recipe the registry refuses for this subject is an
 * HttpError 400 and nothing is written; a missing subject is a 404.
 */
export async function saveRecipePicture(owner: PictureOwner, kind: PictureKind, recipe: unknown): Promise<SavedPicture> {
  const row = await readOwner(owner)
  if (!row) throw notFound()
  const saved = await drawAndRecord(owner, row, kind, recipe, 'any')
  if (!saved) throw notFound()
  return saved
}

function notFound(): HttpError {
  return new HttpError(404, 'Not found')
}

/**
 * The recipe a subject's default picture of this kind is drawn from; null for a person's avatar (their initials).
 * Seeded by the subject's id unless another seed is given, so the same subject always gets the same default — Kernel
 * by its handle, since its row is made again with a new id wherever the database is (a demo's reset).
 */
export async function defaultRecipe(owner: PictureOwner, kind: PictureKind, ctx: PictureContext, seed: string = defaultSeed(owner, kind, ctx)): Promise<PictureRecipe | null> {
  return kind === 'avatar' ? defaultAvatarRecipe(ctx, seed) : randomRecipe(DEFAULT_COVER_STYLE, seed, ctx)
}

/**
 * Gives a subject the spec's default avatar and cover, each only where it has none: an agent a robot (Thumbs without
 * the robots), Kernel its own, a team Initials, the organisation an Icons symbol, and every subject a cover; a person
 * a cover only. Seeded by the subject's id, so the same subject always gets the same pictures. Never throws: a failure
 * is logged and the picture left empty. Returns the fields it set.
 */
export async function applyDefaultPictures(owner: PictureOwner): Promise<Partial<PictureFields>> {
  const set: Partial<PictureFields> = {}
  try {
    const row = await readOwner(owner)
    if (!row) return set
    const { robots } = await picturesNeeds()
    const ctx = contextOf(owner, row, robots)
    for (const kind of ['avatar', 'cover'] as const) {
      if ((kind === 'avatar' ? row.avatarUrl : row.coverUrl) !== null) continue
      try {
        const recipe = await defaultRecipe(owner, kind, ctx)
        if (!recipe) continue
        const saved = await drawAndRecord(owner, row, kind, recipe, { url: null })
        if (!saved) continue
        Object.assign(set, pictureFields(kind, saved))
      } catch (err) {
        logger.error(`The default ${kind} of ${owner.kind} ${owner.id} was not made; it stays empty:`, err)
      }
    }
  } catch (err) {
    logger.error(`The default pictures of ${owner.kind} ${owner.id} were not made; they stay empty:`, err)
  }
  return set
}

function defaultSeed(owner: PictureOwner, kind: PictureKind, ctx: PictureContext): string {
  return `${kind}:${ctx.subject.isKernel ? KERNEL_HANDLE : owner.id}`
}

/**
 * After a rename: draws again each of the subject's pictures whose recipe's style follows the name (Initials), from
 * the same recipe, so the letters match the new name. Any other picture is left as it is. Never throws: a rename is
 * done whether or not its picture could follow. Returns the fields it set.
 */
export async function redrawIfFollowsName(owner: PictureOwner): Promise<Partial<PictureFields>> {
  const set: Partial<PictureFields> = {}
  try {
    for (const kind of ['avatar', 'cover'] as const) {
      try {
        // Twice at most: a guard lost to a second rename's re-draw reads the row again and draws its name.
        for (let attempt = 0; attempt < 2; attempt++) {
          const row = await readOwner(owner)
          if (!row) return set
          const recipe = kind === 'avatar' ? row.avatarRecipe : row.coverRecipe
          if (!recipe || !findStyle(recipe.style)?.followsName) break
          const saved = await drawAndRecord(owner, row, kind, recipe, { url: kind === 'avatar' ? row.avatarUrl : row.coverUrl })
          if (saved) {
            Object.assign(set, pictureFields(kind, saved))
            break
          }
        }
      } catch (err) {
        logger.error(`The ${kind} of ${owner.kind} ${owner.id} was not drawn again after a rename:`, err)
      }
    }
  } catch (err) {
    logger.error(`The pictures of ${owner.kind} ${owner.id} were not drawn again after a rename:`, err)
  }
  return set
}

/** A fresh random picture of the kind the subject's default is: what an agent's tool makes when it names no recipe. */
export async function freshRecipe(owner: PictureOwner, kind: PictureKind, ctx: PictureContext): Promise<PictureRecipe | null> {
  return defaultRecipe(owner, kind, ctx, `${kind}:${owner.id}:${crypto.randomUUID()}`)
}

/**
 * Removes a subject's avatar or cover (spec, *Removing a picture*): a person's avatar goes back to their initials (no
 * picture), and every other picture to the subject's generated default — an agent's avatar its robot, the
 * organisation's its symbol, a team's its Initials, any cover a generated cover. The old files are deleted once the
 * row is updated. A missing subject is a 404.
 */
export async function removePicture(owner: PictureOwner, kind: PictureKind): Promise<{ url: string | null; recipe: PictureRecipe | null }> {
  const row = await readOwner(owner)
  if (!row) throw notFound()
  const { robots } = await picturesNeeds()
  const recipe = await defaultRecipe(owner, kind, contextOf(owner, row, robots))
  if (recipe) {
    const saved = await drawAndRecord(owner, row, kind, recipe, 'any')
    if (!saved) throw notFound()
    return saved
  }
  // Only a person's avatar has no default; anything else without one is hq's own fault, not the caller's.
  if (owner.kind !== 'person' || kind !== 'avatar') throw new Error(`No default ${kind} for ${owner.kind} ${owner.id}`)
  const previous = row.avatarUrl
  const { count } = await prisma.user.updateMany({ where: { id: owner.id }, data: { avatarUrl: null, avatarRecipe: Prisma.DbNull } })
  if (count === 0) throw notFound()
  await deletePictureFiles(owner, previous)
  return { url: null, recipe: null }
}

function pictureFields(kind: PictureKind, saved: SavedPicture): Partial<PictureFields> {
  return kind === 'avatar' ? { avatarUrl: saved.url, avatarRecipe: saved.recipe } : { coverUrl: saved.url, coverRecipe: saved.recipe }
}
