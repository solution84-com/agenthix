/**
 * The picture service (ADR-0187): the one way a generated picture reaches a row. An agent's, a person's, a team's or
 * the organisation's avatar or cover is drawn from a recipe, written through `writePicture` into that subject's own
 * images folder, and recorded as its url and its recipe together, in one update.
 *
 * - `saveRecipePicture` saves a chosen recipe, and throws when it is refused (400) or cannot be made.
 * - `applyDefaultPictures` gives a subject what the spec's defaults say, only where it has no picture yet, and never
 *   throws: a picture that cannot be made must not stop the agent, person or team being made.
 * - `redrawIfFollowsName` draws again a picture whose style follows the name (Initials), after a rename.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import fs from 'node:fs/promises'
import path from 'node:path'
import { defaultAvatarRecipe, randomRecipe } from '../shared/pictures/pictures'
import type { PictureContext, PictureKind, PictureRecipe, SubjectKind } from '../shared/pictures/recipe'
import { findStyle } from '../shared/pictures/styles'
import { smallPictureName } from '../shared/pictures/files'
import { getAgentImagesDir, getHqStorageRoot, getPersonImagesDir } from '../server/hqStoragePaths'
import { Logger } from '../server/utils/logger'
import type { PictureAssets } from './render'
import { NO_ROBOT_FILES, getRobots } from './robots'
import { writePicture } from './writePicture'

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
  switch (owner.kind) {
    case 'agent':
      return { dir: getAgentImagesDir(owner.id), url: f => `/agents/${owner.id}/images/${f}` }
    case 'person':
      return { dir: getPersonImagesDir(owner.id), url: f => `/people/${owner.id}/images/${f}` }
    case 'team':
      return { dir: path.join(getHqStorageRoot(), 'teams', owner.id, 'images'), url: f => `/teams/${owner.id}/images/${f}` }
    case 'org':
      return { dir: path.join(getHqStorageRoot(), 'org', 'images'), url: f => `/org/images/${f}` }
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
  const where = { id: owner.id, ...(expect === 'any' ? {} : { [urlField]: expect.url }) }
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
  if (await recordPicture(owner, kind, url, saved, expect)) return { url, recipe: saved }
  // Not recorded (the row is gone, or the picture changed meanwhile): nothing points at the files.
  await Promise.all([written.fileName, smallPictureName(written.fileName)].map(f => fs.rm(path.join(images.dir, f), { force: true })))
  return null
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

/** The recipe a subject's default picture of this kind is drawn from; null for a person's avatar (their initials). */
export async function defaultRecipe(owner: PictureOwner, kind: PictureKind, ctx: PictureContext): Promise<PictureRecipe | null> {
  const seed = `${kind}:${owner.id}`
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

/**
 * After a rename: draws again each of the subject's pictures whose recipe's style follows the name (Initials), from
 * the same recipe, so the letters match the new name. Any other picture is left as it is. Never throws: a rename is
 * done whether or not its picture could follow. Returns the fields it set.
 */
export async function redrawIfFollowsName(owner: PictureOwner): Promise<Partial<PictureFields>> {
  const set: Partial<PictureFields> = {}
  try {
    const row = await readOwner(owner)
    if (!row) return set
    for (const kind of ['avatar', 'cover'] as const) {
      const recipe = kind === 'avatar' ? row.avatarRecipe : row.coverRecipe
      if (!recipe || !findStyle(recipe.style)?.followsName) continue
      try {
        const saved = await drawAndRecord(owner, row, kind, recipe, { url: kind === 'avatar' ? row.avatarUrl : row.coverUrl })
        if (saved) Object.assign(set, pictureFields(kind, saved))
      } catch (err) {
        logger.error(`The ${kind} of ${owner.kind} ${owner.id} was not drawn again after a rename:`, err)
      }
    }
  } catch (err) {
    logger.error(`The pictures of ${owner.kind} ${owner.id} were not drawn again after a rename:`, err)
  }
  return set
}

function pictureFields(kind: PictureKind, saved: SavedPicture): Partial<PictureFields> {
  return kind === 'avatar' ? { avatarUrl: saved.url, avatarRecipe: saved.recipe } : { coverUrl: saved.url, coverRecipe: saved.recipe }
}
