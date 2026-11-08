/**
 * Publishing a draft (spec part 2 *Editing: draft, then publish*, D24; security review H5). The publisher names the
 * draft revision they looked at, and nothing else is published: a newer revision refuses it. It asks for a note,
 * validates, makes the next version (the publisher chooses patch, minor or major; minor by default), writes that version
 * into the files (`places/metadata.ts`, the same writer a place skill's publish uses) and only then fingerprints and
 * stores them, so the stored content, its fingerprint and the record agree; keeps the based-on list and licence the
 * asset already holds, moves the pin, and ends the draft. A copy's first publish takes its original's place
 * (`ownCopy.ts`).
 */
import type { AssetKind, PrismaClient } from '@prisma/client'
import type { Db } from '../../packages/packageStore'
import { readContent, releaseContent, storeContent } from '../content'
import type { Actor } from '../policy'
import { withSkillMetadata } from '../places/metadata'
import { validateSkill } from '../validation'
import { bumpOf, DraftError, publishNote, publishRefusal } from './drafts'
import { assertEditedInPlace } from './draftStore'
import { originOf, takePlace } from './ownCopy'
import { heldLines } from './provenance'
import { assertLibrary, byOf, identityOf, librarySkill, movePin } from './records'
import { nextVersion } from './versions'

const NOTHING = 'Nothing was changed.'
const TRANSACTION = { timeout: 30_000, maxWait: 10_000 }

export type PublishInput = {
  assetId: unknown
  /** The draft revision the publisher looked at. */
  revision: unknown
  note: unknown
  bump?: unknown
  /** The agent whose request a person approved (D31). */
  requestedByAgentId?: string | null
}

export async function publishDraft(db: PrismaClient, actor: Actor, input: PublishInput): Promise<{ identity: string; version: string; tookPlaceOf: string | null }> {
  await assertLibrary(actor, 'publish', db)
  const by = byOf(actor, input.requestedByAgentId)
  const note = publishNote(input.note)
  const bump = bumpOf(input.bump)
  const asset = await librarySkill(db, input.assetId)
  await assertEditedInPlace(db, asset)
  const seen = typeof input.revision === 'number' ? input.revision : Number.NaN

  return db.$transaction(async tx => {
    const draft = await tx.draft.findUnique({ where: { assetId: asset.id }, include: { revisions: { select: { digest: true } } } })
    const refusal = publishRefusal(draft, seen)
    if (refusal) throw new DraftError(refusal, 409)
    // Taking the draft at the revision seen, so a save landing now can't slip into what is published.
    const { count } = await tx.draft.deleteMany({ where: { id: draft!.id, revision: seen } })
    if (count === 0) throw new DraftError(`The draft changed as you published it. Look at the changes again. ${NOTHING}`, 409)

    const files = await readContent(draft!.digest, tx)
    const { errors } = validateSkill(asset.name, files)
    if (errors.length) throw new DraftError(`${errors.join(' ')} ${NOTHING}`)
    const current = asset.currentVersion
    if (current?.digest === draft!.digest) throw new DraftError(`The draft is the same as ${current.version}, the version in use. ${NOTHING}`, 409)

    const versions = await tx.assetVersion.findMany({ where: { assetId: asset.id }, orderBy: { createdAt: 'desc' } })
    const version = nextVersion(versions.map(v => v.version), bump)
    const newest = versions[0]
    const digest = await storeContent(withSkillMetadata(files, { version }), tx)
    const row = await tx.assetVersion.create({
      data: {
        assetId: asset.id, version, digest, source: 'MADE_HERE', note,
        basedOn: newest ? heldLines(newest.basedOn) : [], licence: newest?.licence ?? null, ...by,
      },
    })
    await movePin(tx, { assetId: asset.id, fromVersionId: current?.id ?? null, toVersionId: row.id, reason: `Published: ${note}`, ...by })
    const tookPlaceOf = await firstPublishOfCopy(tx, asset, versions.length, by.byId)
    for (const held of new Set([draft!.digest, ...draft!.revisions.map(r => r.digest)])) if (held !== digest) await releaseContent(held, tx)
    return { identity: identityOf(asset), version, tookPlaceOf }
  }, TRANSACTION)
}

/** A copy whose only version was the one made when copying: this publish is its first, so it takes the original's place. */
async function firstPublishOfCopy(tx: Db, asset: { id: string; kind: AssetKind }, versionsBefore: number, byId: string): Promise<string | null> {
  if (versionsBefore !== 1) return null
  const origin = await originOf(tx, asset)
  if (!origin || origin.asset.setAsideById !== null) return null
  await takePlace(tx, origin.asset.id, asset.id, byId)
  return origin.line.skill
}
