/**
 * A new skill that exists only as its draft, made with given files: in the Library (as *New skill*, `draftStore.ts`)
 * or in a place (as `placeDrafts.ts#createPlaceSkill`), but with the proposal's files as its one first revision, so a
 * proposed skill is one revision with its author or proposing run (security review H5). The policy is the same:
 * whoever may edit a draft there; an agent only for its person, where that person may.
 */
import type { PrismaClient } from '@prisma/client'
import { formatAssetIdentity, PLACE_SKILLS_ROOT } from '@agenthix/core'
import type { PackageFile } from '../../library/packages/packageZip'
import { storeContent } from '../content'
import { organisationPublisher } from '../organisationPublisher'
import type { Actor } from '../policy'
import { DraftError } from '../lifecycle/drafts'
import { authorOf } from '../lifecycle/draftStore'
import { assertLibrary } from '../lifecycle/records'
import { assertPlace, type PlaceContext } from '../places/place'
import { checkedPlaceSkill, checkedSkill } from '../places/placeDrafts'

const NOTHING = 'Nothing was changed.'
const TRANSACTION = { timeout: 30_000, maxWait: 10_000 }

export async function newLibraryDraft(
  db: PrismaClient, actor: Actor, name: string, files: PackageFile[], conversationId: string | null,
): Promise<{ assetId: string; identity: string; revision: number }> {
  await assertLibrary(actor, 'editDraft', db)
  checkedSkill(name, files)
  const publisher = await organisationPublisher(db)
  const identity = formatAssetIdentity({ publisher, name })
  const taken = await db.asset.findUnique({ where: { kind_publisher_name: { kind: 'SKILL', publisher, name } }, select: { removedAt: true } })
  if (taken) {
    throw new DraftError(taken.removedAt
      ? `${identity} was removed from the Library; it keeps its name and history. Choose another name. ${NOTHING}`
      : `The Library already has ${identity}. To change it, name it in edits. ${NOTHING}`, 409)
  }
  const author = authorOf(actor, conversationId)
  return db.$transaction(async tx => {
    const asset = await tx.asset.create({ data: { kind: 'SKILL', publisher, name } })
    const digest = await storeContent(files, tx)
    const draft = await tx.draft.create({ data: { assetId: asset.id, revision: 1, digest } })
    await tx.draftRevision.create({ data: { draftId: draft.id, number: 1, digest, ...author } })
    return { assetId: asset.id, identity, revision: 1 }
  }, TRANSACTION)
}

/** For every agent in the place: its own skills folder. */
export async function newPlaceDraft(
  db: PrismaClient, actor: Actor, ctx: PlaceContext, name: string, files: PackageFile[], conversationId: string | null,
): Promise<{ placeSkillId: string; path: string; revision: number }> {
  assertPlace(actor, 'editDraft', ctx)
  checkedPlaceSkill(name, files)
  const path = `${PLACE_SKILLS_ROOT}/${name}`
  const taken = await db.placeSkill.findUnique({ where: { placeType_placeId_path: { ...ctx.place, path } } })
  if (taken && (!taken.goneAt || (await db.draft.count({ where: { placeSkillId: taken.id } })) > 0)) {
    throw new DraftError(`This place already has a skill named ${name}. To change it, name it in edits. ${NOTHING}`, 409)
  }
  const author = authorOf(actor, conversationId)
  return db.$transaction(async tx => {
    const skill = taken ?? await tx.placeSkill.create({ data: { ...ctx.place, path, group: 'PLACE' } })
    const digest = await storeContent(files, tx)
    const draft = await tx.draft.create({ data: { placeSkillId: skill.id, revision: 1, digest } })
    await tx.draftRevision.create({ data: { draftId: draft.id, number: 1, digest, ...author } })
    return { placeSkillId: skill.id, path, revision: 1 }
  }, TRANSACTION)
}
