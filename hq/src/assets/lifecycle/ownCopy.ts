/**
 * Editing makes your own copy (spec part 2 *Editing makes your own copy*, D18; *Provenance*, D19). Editing a skill
 * another publisher signed makes the organisation's copy under its own publisher name: its first version is the
 * original's files at the version in use (less the original's manifest, which hq never carries over), with the
 * based-on list written once, and the person edits its draft. When the copy is first published it takes the
 * original's place for every agent that had it, grants and every-agent carried over; the original stays installed,
 * set aside, and switching back is one action. A newer original shows on the copy as news, never merged.
 *
 * Which original a copy was made from is hq's own record: the last line hq wrote in the copy's first version.
 */
import type { PrismaClient } from '@prisma/client'
import { ASSET_MANIFEST_FILE, compareSemVer, formatAssetIdentity, isAssetName, parseAssetIdentity } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { readContent, storeContent } from '../content'
import { organisationPublisher } from '../organisationPublisher'
import type { Actor } from '../policy'
import { isUniqueViolation, LifecycleError } from './errors'
import { copyLines, heldLines, ProvenanceError, type HeldLine } from './provenance'
import { assertLibrary, byOf, identityOf, librarySkill, type LibrarySkill } from './records'
import { bySemVerDescending, fileChanges, type FileChanges } from './versions'
import { pastMark } from './offers'

const NOTHING = 'Nothing was changed.'
const TRANSACTION = { timeout: 30_000, maxWait: 10_000 }

export type Origin = { asset: { id: string; publisher: string; name: string; setAsideById: string | null; removedAt: Date | null }; line: HeldLine }

/** The original a copy was made from, by the line hq wrote when it made the copy; null for anything else. */
export async function originOf(db: Db, copy: { id: string; kind: LibrarySkill['kind'] }): Promise<Origin | null> {
  const first = await db.assetVersion.findFirst({ where: { assetId: copy.id, source: 'MADE_HERE' }, orderBy: { createdAt: 'asc' }, select: { basedOn: true } })
  const line = heldLines(first?.basedOn).filter(l => l.recorded === 'hq').at(-1)
  const identity = line ? parseAssetIdentity(line.skill) : null
  if (!line || !identity) return null
  const asset = await db.asset.findUnique({
    where: { kind_publisher_name: { kind: copy.kind, ...identity } },
    select: { id: true, publisher: true, name: true, setAsideById: true, removedAt: true },
  })
  return asset ? { asset, line } : null
}

/**
 * *Edit*: the skill whose draft is edited. The organisation's own is edited in place. Another publisher's is edited
 * through the organisation's copy, made now if there is none; `copyName` names it when the original's name is taken.
 */
export async function editAsset(db: PrismaClient, actor: Actor, input: { assetId: unknown; copyName?: unknown }, now: Date): Promise<{ assetId: string; identity: string; copied: boolean }> {
  await assertLibrary(actor, 'editDraft', db)
  const by = byOf(actor)
  const original = await librarySkill(db, input.assetId)
  const publisher = await organisationPublisher(db)
  if (original.publisher === publisher) return { assetId: original.id, identity: identityOf(original), copied: false }
  if (original.builtIn) throw new LifecycleError(`${identityOf(original)} is built into hq and isn't edited. ${NOTHING}`, 409)
  if (!original.currentVersion) throw new LifecycleError(`${identityOf(original)} has no version to copy. ${NOTHING}`, 409)
  const name = input.copyName === undefined || input.copyName === null ? original.name : String(input.copyName).trim()
  if (!isAssetName(name)) throw new LifecycleError(`“${String(name).slice(0, 64)}” can't name a skill: use 1 to 64 lowercase letters, digits and single hyphens. ${NOTHING}`)
  const identity = formatAssetIdentity({ publisher, name })

  const alreadyThere = async (): Promise<{ assetId: string; identity: string; copied: false } | null> => {
    const existing = await db.asset.findUnique({ where: { kind_publisher_name: { kind: 'SKILL', publisher, name } } })
    if (!existing) return null
    const origin = existing.removedAt ? null : await originOf(db, existing)
    if (origin?.asset.id === original.id) return { assetId: existing.id, identity, copied: false }
    throw new LifecycleError(`The Library already has ${identity}. Give the copy another name. ${NOTHING}`, 409)
  }
  const there = await alreadyThere()
  if (there) return there
  const pinned = original.currentVersion
  let basedOn: HeldLine[]
  try {
    basedOn = copyLines({
      identity: identityOf(original), version: pinned.version, digest: pinned.digest, basedOn: pinned.basedOn,
      fromPackage: pinned.source !== 'MADE_HERE', publisher: original.publisher,
    }, now)
  } catch (err) {
    if (err instanceof ProvenanceError) throw new LifecycleError(err.message, 409)
    throw err
  }
  const files = (await readContent(pinned.digest, db)).filter(f => f.path !== ASSET_MANIFEST_FILE)
  const makeCopy = () => db.$transaction(async tx => {
    const copy = await tx.asset.create({ data: { kind: 'SKILL', publisher, name, suitedTo: original.suitedTo } })
    const version = await tx.assetVersion.create({
      data: {
        assetId: copy.id, version: pinned.version, digest: await storeContent(files, tx), source: 'MADE_HERE',
        basedOn, licence: pinned.licence, note: `Copied from ${identityOf(original)} ${pinned.version}`, byId: by.byId,
      },
    })
    await tx.asset.update({ where: { id: copy.id }, data: { currentVersionId: version.id } })
    await tx.assetPinChange.create({ data: { assetId: copy.id, toVersionId: version.id, byId: by.byId, reason: `Copied from ${identityOf(original)}` } })
    return { assetId: copy.id, identity, copied: true }
  }, TRANSACTION)
  try {
    return await makeCopy()
  } catch (err) {
    // Someone made it at the same moment: the same copy is theirs and ours; another skill under the name is taken.
    if (!isUniqueViolation(err)) throw err
    const there = await alreadyThere()
    if (there) return there
    throw err
  }
}

/**
 * Moves every agent that has `from` onto `to`: every-agent and each grant. Both are read here, in the caller's
 * transaction, never taken from rows read earlier; a grant is deleted only once it has been moved.
 */
export async function moveHolders(tx: Db, from: { id: string }, toId: string, byId: string): Promise<void> {
  const grants = await tx.assetGrant.findMany({ where: { assetId: from.id }, select: { agentId: true } })
  if (grants.length) {
    await tx.assetGrant.createMany({ data: grants.map(g => ({ assetId: toId, agentId: g.agentId, grantedById: byId })), skipDuplicates: true })
    await tx.assetGrant.deleteMany({ where: { assetId: from.id, agentId: { in: grants.map(g => g.agentId) } } })
  }
  const { count } = await tx.asset.updateMany({ where: { id: from.id, givenToAll: true }, data: { givenToAll: false } })
  if (count > 0) await tx.asset.update({ where: { id: toId }, data: { givenToAll: true } })
}

/** The copy takes the original's place; the original stays installed, set aside. */
export async function takePlace(tx: Db, originId: string, copyId: string, byId: string): Promise<void> {
  await moveHolders(tx, { id: originId }, copyId, byId)
  await tx.asset.update({ where: { id: originId }, data: { setAsideById: copyId } })
}

async function copyAndOrigin(db: Db, copyId: unknown): Promise<{ copy: LibrarySkill; origin: Origin }> {
  const copy = await librarySkill(db, copyId)
  const origin = await originOf(db, copy)
  if (!origin) throw new LifecycleError(`${identityOf(copy)} isn't a copy of another skill. ${NOTHING}`, 409)
  return { copy, origin }
}

/** Switching back: the original serves the agents again, and the copy stays in the Library. */
export async function switchToOriginal(db: PrismaClient, actor: Actor, copyId: unknown): Promise<{ identity: string }> {
  await assertLibrary(actor, 'rollBack', db)
  const by = byOf(actor)
  const { copy, origin } = await copyAndOrigin(db, copyId)
  if (origin.asset.setAsideById !== copy.id) throw new LifecycleError(`${origin.line.skill} isn't set aside for this copy. ${NOTHING}`, 409)
  if (origin.asset.removedAt) throw new LifecycleError(`${origin.line.skill} was removed from the Library, and agents can't use a removed skill. Put it back first, then switch back to it. ${NOTHING}`, 409)
  await db.$transaction(async tx => {
    await moveHolders(tx, copy, origin.asset.id, by.byId)
    await tx.asset.update({ where: { id: origin.asset.id }, data: { setAsideById: null } })
  }, TRANSACTION)
  return { identity: origin.line.skill }
}

/** Switching to the copy again, once it has a published edit. */
export async function switchToCopy(db: PrismaClient, actor: Actor, copyId: unknown): Promise<{ identity: string }> {
  await assertLibrary(actor, 'rollBack', db)
  const by = byOf(actor)
  const { copy, origin } = await copyAndOrigin(db, copyId)
  if (origin.asset.setAsideById === copy.id) throw new LifecycleError(`${identityOf(copy)} is already in use instead of ${origin.line.skill}. ${NOTHING}`, 409)
  // Until it has a published edit, the copy holds only the original's files at the version copied, possibly older than the original in use.
  if ((await db.assetVersion.count({ where: { assetId: copy.id } })) < 2) {
    throw new LifecycleError(`${identityOf(copy)} hasn't been published since it was copied, so it would give agents the older files of ${origin.line.skill}. Publish an edit of it first. ${NOTHING}`, 409)
  }
  await db.$transaction(tx => takePlace(tx, origin.asset.id, copy.id, by.byId), TRANSACTION)
  return { identity: identityOf(copy) }
}

export type CopyNews = { original: string; copiedFrom: string; inUse: boolean; newer: { version: string; changes: FileChanges } | null }

/** What the original has done since the copy was made: its newest version, with what changed, shown and never merged. */
export async function copyNews(db: Db, copyId: unknown): Promise<CopyNews | null> {
  const copy = await librarySkill(db, copyId)
  const origin = await originOf(db, copy)
  if (!origin || !origin.line.version) return null
  const versions = await db.assetVersion.findMany({ where: { assetId: origin.asset.id }, select: { version: true, digest: true } })
  const newest = versions
    .filter(v => compareSemVer(v.version, origin.line.version!) > 0 && pastMark(v.version, copy.newsSeenVersion))
    .sort((a, b) => bySemVerDescending(a.version, b.version))[0]
  const base = { original: origin.line.skill, copiedFrom: origin.line.version, inUse: origin.asset.setAsideById === copy.id }
  if (!newest) return { ...base, newer: null }
  const copied = versions.find(v => v.version === origin.line.version)
  const from = copied ? await readContent(copied.digest, db) : []
  return { ...base, newer: { version: newest.version, changes: fileChanges(from, await readContent(newest.digest, db)) } }
}
