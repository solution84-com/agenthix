/**
 * The one way a picture is written to hq's storage (ADR-0187): an agent's, a person's, a team's or the organisation's
 * avatar or cover, drawn from a recipe or already encoded (an upload sharp has re-encoded). Writes `{uuid}.webp` and
 * `{uuid}-small.webp` under `dir`, each through the containment check against hq's storage root — the boundary,
 * whatever directory the caller names — and returns the full file's name for the caller to record. A fresh uuid each
 * time, so a picture's address is its version.
 */
import { HttpError } from 'wasp/server'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { validateRecipe } from '../shared/pictures/pictures'
import type { PictureContext, PictureKind, PictureRecipe } from '../shared/pictures/recipe'
import { smallPictureName } from '../shared/pictures/files'
import { resolveRealWriteTargetWithin } from '../server/realPathWithin'
import { getHqStorageRoot } from '../server/hqStoragePaths'
import type { EncodedPicture } from './encode'
import { renderRecipe, type PictureAssets } from './render'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Pictures')

export type PictureSource =
  | { type: 'recipe'; recipe: unknown; kind: PictureKind; context: PictureContext; assets: PictureAssets }
  | { type: 'encoded'; picture: EncodedPicture }

export interface WrittenPicture {
  /** `{uuid}.webp`; the small copy is `smallPictureName(fileName)` beside it. */
  fileName: string
  /** Both files' bytes together, for a storage budget. */
  bytes: number
  /** The validated recipe to store on the row, or null for an encoded picture. */
  recipe: PictureRecipe | null
}

export async function writePicture(dir: string, source: PictureSource): Promise<WrittenPicture> {
  let picture: EncodedPicture
  let recipe: PictureRecipe | null = null
  if (source.type === 'recipe') {
    const check = await validateRecipe(source.recipe, source.kind, source.context)
    if (!check.ok) {
      logger.warn(`A picture recipe was refused: ${check.reason}`)
      throw new HttpError(400, 'That picture cannot be made')
    }
    recipe = check.recipe
    picture = await renderRecipe(recipe, source.kind, source.context, source.assets)
  } else {
    picture = source.picture
  }

  const fileName = `${crypto.randomUUID()}.webp`
  const root = getHqStorageRoot()
  const [fullTarget, smallTarget] = await Promise.all([
    resolveRealWriteTargetWithin(root, path.join(dir, fileName)),
    resolveRealWriteTargetWithin(root, path.join(dir, smallPictureName(fileName))),
  ])
  if (!fullTarget || !smallTarget) throw new HttpError(403, 'Path not allowed')

  await fs.mkdir(path.dirname(fullTarget), { recursive: true })
  await fs.writeFile(smallTarget, picture.small, { flag: 'wx' })
  try {
    await fs.writeFile(fullTarget, picture.full, { flag: 'wx' })
  } catch (e) {
    await fs.rm(smallTarget, { force: true })
    throw e
  }
  return { fileName, bytes: picture.full.length + picture.small.length, recipe }
}
