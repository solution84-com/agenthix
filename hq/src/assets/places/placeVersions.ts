/**
 * A place skill's versions, by publishing (spec part 4 FV1–FV5; D25). Publishing writes the files through the site,
 * with the version written into `SKILL.md` as `metadata.version`, and records the number, the fingerprint of exactly
 * what was written, its content and who published it. Rolling back publishes an older version's files as the next
 * version. A change made outside the editor is *changed in files, not published*: it is published as the next version
 * from the files as the publisher saw them, or the newest version is put back. A publish carries the skill's switch to
 * what it wrote, since publishing is the review. Only the place's administrators, or the person in Your space, do
 * these; an agent only asks (D31), so who asked is a parameter here and never read from a request.
 */
import type { PlaceSkill, PrismaClient } from '@prisma/client'
import { LocationFileError, type LocationRef } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import type { PackageFile } from '../../library/packages/packageZip'
import { fingerprintOf, readContent, releaseContent, storeContent } from '../content'
import type { Actor } from '../policy'
import { DraftError, publishNote, publishRefusal } from '../lifecycle/drafts'
import { LifecycleError } from '../lifecycle/errors'
import { byOf } from '../lifecycle/records'
import { withSkillMetadata } from './metadata'
import { assertNotWorkspace, assertPlace, folderOf, placeOfSkill, type PlaceContext } from './place'
import { checkedSkill, liveFiles, newestVersion, skillNameOf } from './placeDrafts'
import { readSkillFolder, writeSkillFolder } from './siteSkills'

const NOTHING = 'Nothing was changed.'
const TRANSACTION = { timeout: 30_000, maxWait: 10_000 }

type Published = { number: number; fingerprint: string }
type By = { publishedById: string; requestedByAgentId: string | null }

function byFor(actor: Actor, requestedByAgentId?: string | null): By {
  const by = byOf(actor, requestedByAgentId)
  return { publishedById: by.byId, requestedByAgentId: by.requestedByAgentId ?? null }
}

/** Writes `files` as the skill's next version: into hq's record, then the place's folder, in one transaction. */
export async function publishFiles(
  tx: Db, ctx: PlaceContext, skill: PlaceSkill, files: PackageFile[], by: By, note: string,
  meta: { identity?: string; version?: string } = {},
): Promise<Published> {
  const newest = await newestVersion(tx, skill.id)
  const number = (newest?.number ?? 0) + 1
  const written = withSkillMetadata(files, { version: meta.version ?? String(number), identity: meta.identity })
  checkedSkill(skillNameOf(skill), written)
  const fingerprint = await storeContent(written, tx)
  await tx.placeSkillVersion.create({ data: { placeSkillId: skill.id, number, digest: fingerprint, note, ...by } })
  const { loc, dir } = folderOf(ctx, skill)
  if ((skill.goneAt || skill.lastFingerprint === null) && await folderHoldsFiles(loc, dir)) {
    throw new LifecycleError(`The place's files hold a folder there that HQ hasn't looked at. Look at the place again. ${NOTHING}`, 409)
  }
  await writeSkillFolder(loc, dir, written)
  await tx.placeSkill.update({
    where: { id: skill.id },
    data: { lastFingerprint: fingerprint, lastSeenAt: new Date(), goneAt: null, ...(skill.switch ? { switchFingerprint: fingerprint } : {}) },
  })
  return { number, fingerprint }
}

/** A folder last seen missing, or never seen, is written only while it still holds nothing: nothing unseen is written over. */
async function folderHoldsFiles(loc: LocationRef, dir: string): Promise<boolean> {
  try {
    return (await readSkillFolder(loc, dir)).length > 0
  } catch (err) {
    if (err instanceof LocationFileError && err.code === 'not_found') return false
    throw err
  }
}

async function publishable(db: Db, actor: Actor, placeSkillId: unknown, action: 'publish' | 'rollBack') {
  const found = await placeOfSkill(db, placeSkillId)
  assertPlace(actor, action, found.ctx)
  assertNotWorkspace(found.skill, action === 'publish' ? 'Publishing' : 'Rolling back')
  return found
}

export type PlacePublishInput = { placeSkillId: unknown; revision: unknown; note: unknown; requestedByAgentId?: string | null }

/** FV1, FV2: publishes the draft at the revision the publisher saw (security review H5). */
export async function publishPlaceDraft(db: PrismaClient, actor: Actor, input: PlacePublishInput): Promise<Published> {
  const { ctx, skill } = await publishable(db, actor, input.placeSkillId, 'publish')
  const by = byFor(actor, input.requestedByAgentId)
  const note = publishNote(input.note)
  const seen = typeof input.revision === 'number' ? input.revision : Number.NaN
  return db.$transaction(async tx => {
    const draft = await tx.draft.findUnique({ where: { placeSkillId: skill.id }, include: { revisions: { select: { digest: true } } } })
    const refusal = publishRefusal(draft, seen)
    if (refusal) throw new DraftError(refusal, 409)
    const { count } = await tx.draft.deleteMany({ where: { id: draft!.id, revision: seen } })
    if (count === 0) throw new DraftError(`The draft changed as you published it. Look at the changes again. ${NOTHING}`, 409)
    const published = await publishFiles(tx, ctx, skill, await readContent(draft!.digest, tx), by, note)
    for (const digest of new Set([draft!.digest, ...draft!.revisions.map(r => r.digest)])) {
      if (digest !== published.fingerprint) await releaseContent(digest, tx)
    }
    return published
  }, TRANSACTION)
}

/** What a skill's files hold that no version does, read from the site now and checked against what was shown. */
async function changedFiles(db: Db, ctx: PlaceContext, skill: PlaceSkill, fingerprint: unknown): Promise<PackageFile[]> {
  if (skill.goneAt) throw new LifecycleError(`That skill's folder is no longer in the place's files. ${NOTHING}`, 409)
  if (typeof fingerprint !== 'string' || fingerprint !== skill.lastFingerprint) {
    throw new LifecycleError(`The skill's files changed since you looked at them. Look at the changes again. ${NOTHING}`, 409)
  }
  const files = await liveFiles(db, ctx, skill)
  if (fingerprintOf(files) !== fingerprint) {
    throw new LifecycleError(`The skill's files changed since the place was last looked at. Look at the place again. ${NOTHING}`, 409)
  }
  return files
}

/** FV4 *Publish as version N*: the files as they are, which must still be what the publisher looked at. */
export async function publishFromFiles(
  db: PrismaClient, actor: Actor, input: { placeSkillId: unknown; fingerprint: unknown; note: unknown; requestedByAgentId?: string | null },
): Promise<Published> {
  const { ctx, skill } = await publishable(db, actor, input.placeSkillId, 'publish')
  const by = byFor(actor, input.requestedByAgentId)
  const note = publishNote(input.note)
  const files = await changedFiles(db, ctx, skill, input.fingerprint)
  const same = await db.placeSkillVersion.findFirst({ where: { placeSkillId: skill.id, digest: skill.lastFingerprint! } })
  if (same) throw new LifecycleError(`The files are version ${same.number}; there is nothing new to publish. ${NOTHING}`, 409)
  return db.$transaction(tx => publishFiles(tx, ctx, skill, files, by, note), TRANSACTION)
}

/** FV3: an older version's files, published as the next version. */
export async function rollBackPlaceSkill(
  db: PrismaClient, actor: Actor, input: { placeSkillId: unknown; versionId: unknown; reason?: unknown; requestedByAgentId?: string | null },
): Promise<Published> {
  const { ctx, skill } = await publishable(db, actor, input.placeSkillId, 'rollBack')
  const by = byFor(actor, input.requestedByAgentId)
  const target = typeof input.versionId === 'string'
    ? await db.placeSkillVersion.findFirst({ where: { id: input.versionId, placeSkillId: skill.id } })
    : null
  if (!target) throw new LifecycleError(`That version isn't in this skill's history. ${NOTHING}`, 404)
  const newest = await newestVersion(db, skill.id)
  if (newest?.id === target.id) throw new LifecycleError(`Version ${target.number} is the newest version already. ${NOTHING}`, 409)
  const reason = typeof input.reason === 'string' && input.reason.trim() ? `: ${input.reason.trim().slice(0, 900)}` : ''
  const files = await readContent(target.digest, db)
  return db.$transaction(tx => publishFiles(tx, ctx, skill, files, by, `Rolled back to version ${target.number}${reason}`), TRANSACTION)
}

/** FV4 *Put back version N*: the newest version's files written back over a change made outside the editor. */
export async function putBackPlaceSkill(
  db: PrismaClient, actor: Actor, input: { placeSkillId: unknown; fingerprint: unknown },
): Promise<{ number: number }> {
  const { ctx, skill } = await publishable(db, actor, input.placeSkillId, 'rollBack')
  byFor(actor)
  // A folder that is gone is simply written back; one that is there must still hold what the person looked at.
  if (!skill.goneAt && (typeof input.fingerprint !== 'string' || input.fingerprint !== skill.lastFingerprint)) {
    throw new LifecycleError(`The skill's files changed since you looked at them. Look at the changes again. ${NOTHING}`, 409)
  }
  const newest = await newestVersion(db, skill.id)
  if (!newest) throw new LifecycleError(`The skill has never been published, so there is nothing to put back. ${NOTHING}`, 409)
  if (!skill.goneAt && newest.digest === skill.lastFingerprint) throw new LifecycleError(`The files are version ${newest.number} already. ${NOTHING}`, 409)
  const files = await readContent(newest.digest, db)
  const { loc, dir } = folderOf(ctx, skill)
  if (skill.goneAt && await folderHoldsFiles(loc, dir)) {
    throw new LifecycleError(`The place's files hold a folder there that HQ hasn't looked at. Look at the place again. ${NOTHING}`, 409)
  }
  await db.$transaction(async tx => {
    const { count } = await tx.placeSkill.updateMany({
      where: { id: skill.id, lastFingerprint: skill.lastFingerprint },
      data: { lastFingerprint: newest.digest, lastSeenAt: new Date(), goneAt: null },
    })
    if (count === 0) throw new LifecycleError(`The skill changed as you put it back. Look at it again. ${NOTHING}`, 409)
    await writeSkillFolder(loc, dir, files)
  }, TRANSACTION)
  return { number: newest.number }
}
